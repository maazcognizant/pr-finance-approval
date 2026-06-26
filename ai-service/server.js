"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/* =========================================================
 * Cloud Foundry service-binding helpers
 * ======================================================= */

/**
 * Read credentials from a bound Cloud Foundry service.
 */
function getServiceCredentials(serviceName) {
  try {
    const services = JSON.parse(
      process.env.VCAP_SERVICES || "{}"
    );

    for (const serviceGroup of Object.values(services)) {
      if (!Array.isArray(serviceGroup)) {
        continue;
      }

      const matchedService = serviceGroup.find(
        (service) => service.name === serviceName
      );

      if (matchedService) {
        return matchedService.credentials || {};
      }
    }
  } catch (error) {
    console.error(
      "Unable to parse VCAP_SERVICES:",
      error.message
    );
  }

  return {};
}

/* =========================================================
 * Gemini configuration
 * ======================================================= */

const boundGeminiSecrets =
  getServiceCredentials("pr-gemini-secrets");

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  boundGeminiSecrets.GEMINI_API_KEY ||
  boundGeminiSecrets.geminiApiKey ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  boundGeminiSecrets.GEMINI_MODEL ||
  boundGeminiSecrets.geminiModel ||
  "gemini-2.5-flash";

/* =========================================================
 * SAP Build Process Automation configuration
 * ======================================================= */

/**
 * This is the SAP Build Process Automation standard service
 * instance created in BTP Cockpit.
 *
 * Its credentials include:
 * - endpoints.api
 * - uaa.clientid
 * - uaa.clientsecret
 * - uaa.url
 */
const boundBpaService =
  getServiceCredentials(
    "purchase-requisition-bpa-api"
  );

/**
 * This is the user-provided service that stores:
 * - BPA_API_KEY
 * - BPA_DEFINITION_ID
 *
 * Optionally it may also store:
 * - BPA_TRIGGER_URL
 */
const boundBpaSecrets =
  getServiceCredentials(
    "pr-bpa-trigger-secrets"
  );

const bpaUaa =
  boundBpaService.uaa || {};

const BPA_CLIENT_ID =
  process.env.BPA_CLIENT_ID ||
  bpaUaa.clientid ||
  "";

const BPA_CLIENT_SECRET =
  process.env.BPA_CLIENT_SECRET ||
  bpaUaa.clientsecret ||
  "";

const BPA_AUTH_URL =
  process.env.BPA_AUTH_URL ||
  bpaUaa.url ||
  "";

const BPA_API_BASE_URL =
  process.env.BPA_API_BASE_URL ||
  boundBpaService?.endpoints?.api ||
  "";

const BPA_TRIGGER_URL =
  process.env.BPA_TRIGGER_URL ||
  boundBpaSecrets.BPA_TRIGGER_URL ||
  (
    BPA_API_BASE_URL
      ? `${BPA_API_BASE_URL}/workflow/rest/v1/workflow-instances`
      : ""
  );

const BPA_DEFINITION_ID =
  process.env.BPA_DEFINITION_ID ||
  boundBpaSecrets.BPA_DEFINITION_ID ||
  "";

const BPA_API_KEY =
  process.env.BPA_API_KEY ||
  boundBpaSecrets.BPA_API_KEY ||
  boundBpaSecrets.apiKey ||
  "";

/* =========================================================
 * Express middleware
 * ======================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "api-key"
    ]
  })
);

app.use(
  express.json({
    limit: "100kb"
  })
);

/* =========================================================
 * Shared utility functions
 * ======================================================= */

/**
 * Convert a supplied value into safe trimmed text.
 */
function cleanText(value, maxLength = 1000) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value)
    .trim()
    .slice(0, maxLength);
}

/**
 * Remove blank optional properties.
 */
function removeEmptyValues(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => {
      if (
        value === undefined ||
        value === null
      ) {
        return false;
      }

      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        return false;
      }

      return true;
    })
  );
}

/**
 * Convert an array to numbered multiline text.
 */
function listToText(value) {
  if (!Array.isArray(value)) {
    return cleanText(value, 1500);
  }

  return value
    .filter((item) => {
      return (
        item !== undefined &&
        item !== null &&
        String(item).trim() !== ""
      );
    })
    .map((item, index) => {
      return `${index + 1}. ${cleanText(item, 500)}`;
    })
    .join("\n");
}

/**
 * Safely parse JSON or return plain response text.
 */
async function readResponseBody(response) {
  const responseText =
    await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    return {
      rawResponse:
        cleanText(
          responseText,
          2000
        )
    };
  }
}

/**
 * Validate a basic email address.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    cleanText(email, 250)
  );
}

/* =========================================================
 * Request-form validation and BPA helpers
 * ======================================================= */

/**
 * Required fields submitted by the custom requester UI.
 */
function validateSubmissionRequest(body = {}) {
  const requiredFields = [
    "employeeName",
    "employeeEmail",
    "department",
    "itemName",
    "quantity",
    "estimatedCost",
    "businessReason",
    "requiredDate"
  ];

  return requiredFields.filter((field) => {
    const value = body[field];

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    );
  });
}

/**
 * Return missing BPA configuration names.
 */
function getMissingBpaConfiguration() {
  const requiredConfiguration = {
    BPA_CLIENT_ID,
    BPA_CLIENT_SECRET,
    BPA_AUTH_URL,
    BPA_TRIGGER_URL,
    BPA_DEFINITION_ID,
    BPA_API_KEY
  };

  return Object.entries(requiredConfiguration)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

/**
 * Obtain an OAuth access token from XSUAA.
 */
async function getBpaAccessToken() {
  const tokenUrl =
    `${BPA_AUTH_URL.replace(/\/+$/, "")}/oauth/token`;

  const encodedCredentials =
    Buffer.from(
      `${BPA_CLIENT_ID}:${BPA_CLIENT_SECRET}`
    ).toString("base64");

  const response = await fetch(
    tokenUrl,
    {
      method: "POST",

      headers: {
        Authorization:
          `Basic ${encodedCredentials}`,

        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body:
        "grant_type=client_credentials"
    }
  );

  const responseBody =
    await readResponseBody(response);

  if (
    !response.ok ||
    !responseBody.access_token
  ) {
    const error =
      new Error(
        responseBody.error_description ||
        responseBody.error ||
        "Unable to obtain BPA OAuth access token."
      );

    error.status =
      response.status;

    error.upstreamBody =
      responseBody;

    throw error;
  }

  return responseBody.access_token;
}

/**
 * Convert requester-UI field names into exact BPA process
 * input names.
 *
 * Important:
 * BPA uses employeeID and projectID with capital ID.
 */
function buildBpaTriggerContext(body = {}) {
  return removeEmptyValues({
    employeeID: cleanText(
      body.employeeId,
      100
    ),

    employeeName: cleanText(
      body.employeeName,
      200
    ),

    employeeEmail: cleanText(
      body.employeeEmail,
      250
    ),

    department: cleanText(
      body.department,
      200
    ),

    itemName: cleanText(
      body.itemName,
      300
    ),

    quantity:
      Number(body.quantity),

    estimatedCost:
      Number(body.estimatedCost),

    businessReason: cleanText(
      body.businessReason,
      1500
    ),

    requiredDate: cleanText(
      body.requiredDate,
      100
    ),

    purchaseType: cleanText(
      body.purchaseType,
      100
    ),

    projectName: cleanText(
      body.projectName,
      300
    ),

    projectID: cleanText(
      body.projectId,
      150
    ),

    costCentre: cleanText(
      body.costCentre,
      150
    ),

    vendorName: cleanText(
      body.vendorName,
      300
    ),

    vendorPreference: cleanText(
      body.vendorPreference,
      300
    )
  });
}

/* =========================================================
 * Gemini validation and response helpers
 * ======================================================= */

/**
 * Required fields for direct AI analysis requests from BPA.
 */
function validateAnalysisRequest(body = {}) {
  const requiredFields = [
    "requestId",
    "itemName",
    "quantity",
    "estimatedCost",
    "department",
    "businessReason",
    "requiredDate"
  ];

  return requiredFields.filter((field) => {
    const value = body[field];

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    );
  });
}

/**
 * Extract Gemini error information.
 */
function getGeminiErrorDetails(error) {
  const message =
    error?.message ||
    error?.error?.message ||
    error?.response?.data?.error?.message ||
    "Unknown Gemini API error";

  const status =
    error?.status ||
    error?.statusCode ||
    error?.error?.code ||
    error?.response?.status ||
    500;

  const errorName =
    error?.name ||
    error?.error?.status ||
    "GeminiAPIError";

  return {
    message:
      cleanText(
        message,
        2000
      ),

    status,

    errorName:
      cleanText(
        errorName,
        200
      )
  };
}

/**
 * Parse Gemini JSON output.
 */
function parseGeminiJson(response) {
  const rawText =
    response?.text;

  if (
    !rawText ||
    typeof rawText !== "string"
  ) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  const jsonText = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error(
      "Unable to parse Gemini response:",
      jsonText
    );

    throw new Error(
      "Gemini returned invalid JSON output."
    );
  }
}

/**
 * Normalize AI response for SAP BPA.
 */
function normalizeAnalysis(analysis = {}) {
  let justificationScore =
    Number(
      analysis.justificationScore
    );

  if (
    !Number.isFinite(
      justificationScore
    )
  ) {
    justificationScore = 0;
  }

  justificationScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          justificationScore
        )
      )
    );

  const allowedRiskLevels = [
    "Low",
    "Medium",
    "High"
  ];

  const allowedRecommendations = [
    "Proceed to review",
    "Request clarification",
    "Request alternative quotation",
    "Escalate for additional review"
  ];

  const riskLevel =
    allowedRiskLevels.includes(
      analysis.riskLevel
    )
      ? analysis.riskLevel
      : "Medium";

  const recommendation =
    allowedRecommendations.includes(
      analysis.recommendation
    )
      ? analysis.recommendation
      : "Request clarification";

  return {
    aiSummary:
      cleanText(
        analysis.summary,
        1500
      ),

    aiJustificationScore:
      justificationScore,

    aiRiskLevel:
      riskLevel,

    aiRecommendation:
      recommendation,

    aiBudgetObservation:
      cleanText(
        analysis.budgetObservation,
        1000
      ),

    aiMissingInformation:
      listToText(
        analysis.missingInformation
      ),

    aiSuggestedQuestions:
      listToText(
        analysis.suggestedQuestions
      ),

    aiAnalysisStatus:
      "COMPLETED"
  };
}

/* =========================================================
 * General endpoints
 * ======================================================= */

/**
 * Root endpoint.
 */
app.get("/", (req, res) => {
  return res.status(200).json({
    status: "UP",
    service:
      "Purchase Requisition AI and BPA Integration Service",
    model:
      GEMINI_MODEL,

    endpoints: {
      health:
        "/health",

      geminiTest:
        "/api/ai/test",

      analyzePurchase:
        "/api/ai/analyze-purchase",

      submitPurchaseRequest:
        "/api/purchase-requests"
    }
  });
});

/**
 * Health endpoint.
 */
app.get("/health", (req, res) => {
  const missingBpaConfiguration =
    getMissingBpaConfiguration();

  return res.status(200).json({
    status: "UP",

    service:
      "Purchase Requisition AI and BPA Integration Service",

    model:
      GEMINI_MODEL,

    port:
      PORT,

    geminiApiKeyConfigured:
      Boolean(
        GEMINI_API_KEY
      ),

    geminiConfigurationSource:
      process.env.GEMINI_API_KEY
        ? "ENVIRONMENT_VARIABLE"
        : GEMINI_API_KEY
          ? "BOUND_SERVICE"
          : "NOT_CONFIGURED",

    bpaTriggerConfigured:
      missingBpaConfiguration.length === 0,

    bpaMissingConfiguration:
      missingBpaConfiguration
  });
});

/* =========================================================
 * Custom requester endpoint
 * ======================================================= */

/**
 * Called by pr-request-ui.
 *
 * Flow:
 * requester UI
 * → Node.js backend
 * → OAuth token
 * → BPA API trigger
 * → Department Head My Inbox
 */
app.post(
  "/api/purchase-requests",
  async (req, res) => {
    try {
      const missingFields =
        validateSubmissionRequest(
          req.body
        );

      if (
        missingFields.length > 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            `Missing required fields: ${missingFields.join(
              ", "
            )}`,

          missingFields
        });
      }

      const employeeEmail =
        cleanText(
          req.body.employeeEmail,
          250
        );

      if (
        !isValidEmail(
          employeeEmail
        )
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            "Employee email must be a valid email address."
        });
      }

      const quantity =
        Number(
          req.body.quantity
        );

      const estimatedCost =
        Number(
          req.body.estimatedCost
        );

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            "Quantity must be a whole number greater than zero."
        });
      }

      if (
        !Number.isFinite(
          estimatedCost
        ) ||
        estimatedCost < 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            "Estimated cost must be a valid non-negative number."
        });
      }

      const missingConfiguration =
        getMissingBpaConfiguration();

      if (
        missingConfiguration.length > 0
      ) {
        console.error(
          "Missing BPA configuration:",
          missingConfiguration
        );

        return res.status(500).json({
          error:
            "BPA_CONFIGURATION_ERROR",

          message:
            "The BPA trigger integration is not fully configured.",

          missingConfiguration
        });
      }

      const accessToken =
        await getBpaAccessToken();

      const triggerContext =
        buildBpaTriggerContext({
          ...req.body,
          employeeEmail,
          quantity,
          estimatedCost
        });

      const triggerPayload = {
        definitionId:
          BPA_DEFINITION_ID,

        context:
          triggerContext
      };

      const bpaResponse =
        await fetch(
          BPA_TRIGGER_URL,
          {
            method:
              "POST",

            headers: {
              Authorization:
                `Bearer ${accessToken}`,

              "api-key":
                BPA_API_KEY,

              "Content-Type":
                "application/json",

              Accept:
                "application/json"
            },

            body:
              JSON.stringify(
                triggerPayload
              )
          }
        );

      const bpaResult =
        await readResponseBody(
          bpaResponse
        );

      if (!bpaResponse.ok) {
        console.error(
          "BPA trigger failed:",
          {
            status:
              bpaResponse.status,

            response:
              bpaResult
          }
        );

        return res.status(502).json({
          error:
            "BPA_TRIGGER_FAILED",

          message:
            bpaResult.message ||
            bpaResult.error ||
            "SAP Build Process Automation rejected the trigger request.",

          upstreamStatus:
            bpaResponse.status
        });
      }

      const processInstanceId =
        bpaResult.id ||
        bpaResult.processInstanceId ||
        "";

      const workflowStatus =
        bpaResult.status ||
        "RUNNING";

      console.log(
        "Purchase requisition workflow started:",
        {
          processInstanceId,
          status:
            workflowStatus
        }
      );

      return res.status(201).json({
        success: true,

        message:
          "Purchase request submitted successfully.",

        processInstanceId,

        status:
          workflowStatus
      });
    } catch (error) {
      console.error(
        "Purchase request submission failed:",
        error
      );

      return res.status(500).json({
        error:
          "PURCHASE_REQUEST_SUBMISSION_FAILED",

        message:
          cleanText(
            error?.message ||
            "Unable to submit the purchase request.",
            2000
          ),

        upstreamStatus:
          error?.status ||
          500
      });
    }
  }
);

/* =========================================================
 * Gemini test endpoint
 * ======================================================= */

app.get(
  "/api/ai/test",
  async (req, res) => {
    try {
      if (!GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            "CONFIGURATION_ERROR",

          message:
            "Gemini API key is not configured."
        });
      }

      const ai =
        new GoogleGenAI({
          apiKey:
            GEMINI_API_KEY
        });

      const response =
        await ai.models.generateContent({
          model:
            GEMINI_MODEL,

          contents:
            "Reply with exactly the word OK."
        });

      return res.status(200).json({
        status:
          "SUCCESS",

        model:
          GEMINI_MODEL,

        response:
          cleanText(
            response?.text,
            500
          )
      });
    } catch (error) {
      const details =
        getGeminiErrorDetails(
          error
        );

      console.error(
        "Gemini connection test failed:",
        error
      );

      return res.status(500).json({
        error:
          "GEMINI_TEST_FAILED",

        message:
          details.message,

        upstreamStatus:
          details.status,

        errorName:
          details.errorName,

        model:
          GEMINI_MODEL
      });
    }
  }
);

/* =========================================================
 * Main Gemini purchase analysis endpoint
 * ======================================================= */

app.post(
  "/api/ai/analyze-purchase",
  async (req, res) => {
    try {
      const missingFields =
        validateAnalysisRequest(
          req.body
        );

      if (
        missingFields.length > 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            `Missing required fields: ${missingFields.join(
              ", "
            )}`,

          missingFields,

          aiAnalysisStatus:
            "FAILED"
        });
      }

      if (!GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            "CONFIGURATION_ERROR",

          message:
            "Gemini API key is not configured.",

          aiAnalysisStatus:
            "FAILED"
        });
      }

      const quantity =
        Number(
          req.body.quantity
        );

      const estimatedCost =
        Number(
          req.body.estimatedCost
        );

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <= 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            "Quantity must be a whole number greater than zero.",

          aiAnalysisStatus:
            "FAILED"
        });
      }

      if (
        !Number.isFinite(
          estimatedCost
        ) ||
        estimatedCost < 0
      ) {
        return res.status(400).json({
          error:
            "VALIDATION_ERROR",

          message:
            "Estimated cost must be a valid non-negative number.",

          aiAnalysisStatus:
            "FAILED"
        });
      }

      const purchaseRequest =
        removeEmptyValues({
          requestId:
            cleanText(
              req.body.requestId,
              100
            ),

          employeeName:
            cleanText(
              req.body.employeeName,
              200
            ),

          employeeId:
            cleanText(
              req.body.employeeId,
              100
            ),

          employeeEmail:
            cleanText(
              req.body.employeeEmail,
              250
            ),

          department:
            cleanText(
              req.body.department,
              200
            ),

          itemName:
            cleanText(
              req.body.itemName,
              300
            ),

          quantity,

          estimatedCost,

          currency:
            cleanText(
              req.body.currency ||
              "INR",
              20
            ),

          businessReason:
            cleanText(
              req.body.businessReason,
              1500
            ),

          requiredDate:
            cleanText(
              req.body.requiredDate,
              100
            ),

          purchaseType:
            cleanText(
              req.body.purchaseType,
              100
            ),

          projectName:
            cleanText(
              req.body.projectName,
              300
            ),

          projectId:
            cleanText(
              req.body.projectId,
              150
            ),

          costCentre:
            cleanText(
              req.body.costCentre,
              150
            ),

          vendorName:
            cleanText(
              req.body.vendorName,
              300
            ),

          vendorPreference:
            cleanText(
              req.body.vendorPreference,
              300
            )
        });

      const suppliedFields =
        Object.keys(
          purchaseRequest
        );

      const ai =
        new GoogleGenAI({
          apiKey:
            GEMINI_API_KEY
        });

      const prompt = `
You are an enterprise purchase requisition review assistant.

Your role is to provide advisory analysis for a Department Head and Finance reviewer.

The final decision must always be made by a human reviewer.

PURCHASE REQUEST ANALYSIS RULES

1. Analyse only the information included in the supplied JSON.
2. Do not invent company policies, budget limits, employee data, project data, vendor data, quotations, approvals, prices or business facts.
3. Do not report an optional field as missing merely because it is absent.
4. Do not request Employee ID when it was not supplied. Employee ID is optional.
5. Do not request Project Name or Project ID for a Department Purchase or General Purchase.
6. For a Project Purchase:
   - Project Name and Project ID may be relevant.
   - Report them as missing only when their absence materially affects cost allocation or approval.
7. Vendor Name and Vendor Preference are optional.
8. Do not report Vendor Name as missing when no vendor information was supplied.
9. Evaluate the request mainly using:
   - Item Name
   - Quantity
   - Estimated Cost
   - Department
   - Business Reason
   - Required Date
10. Missing information must contain only information that materially affects the reviewer's ability to evaluate this specific request.
11. If no important information is missing, return an empty missingInformation array.
12. Suggested questions must be relevant to the supplied request.
13. Do not ask generic or unrelated questions.
14. Base the justification score only on the supplied request.
15. Do not claim that budget is available or unavailable because no live budget system is connected.
16. Budget observations must be advisory.
17. Risk level must be exactly:
   - Low
   - Medium
   - High
18. Recommendation must be exactly:
   - Proceed to review
   - Request clarification
   - Request alternative quotation
   - Escalate for additional review
19. Keep the summary concise and professional.
20. Return only valid JSON matching the required schema.

REQUIRED API FIELDS

- requestId
- itemName
- quantity
- estimatedCost
- department
- businessReason
- requiredDate

OPTIONAL API FIELDS

- employeeName
- employeeId
- employeeEmail
- currency
- purchaseType
- projectName
- projectId
- costCentre
- vendorName
- vendorPreference

FIELDS ACTUALLY SUPPLIED IN THIS REQUEST

${JSON.stringify(
  suppliedFields,
  null,
  2
)}

PURCHASE REQUEST

${JSON.stringify(
  purchaseRequest,
  null,
  2
)}
`;

      const response =
        await ai.models.generateContent({
          model:
            GEMINI_MODEL,

          contents:
            prompt,

          config: {
            responseMimeType:
              "application/json",

            responseJsonSchema: {
              type:
                "object",

              additionalProperties:
                false,

              required: [
                "summary",
                "justificationScore",
                "riskLevel",
                "recommendation",
                "budgetObservation",
                "missingInformation",
                "suggestedQuestions"
              ],

              properties: {
                summary: {
                  type:
                    "string",

                  description:
                    "A concise summary based only on supplied data."
                },

                justificationScore: {
                  type:
                    "integer",

                  minimum:
                    0,

                  maximum:
                    100,

                  description:
                    "Completeness and quality of the supplied business justification."
                },

                riskLevel: {
                  type:
                    "string",

                  enum: [
                    "Low",
                    "Medium",
                    "High"
                  ]
                },

                recommendation: {
                  type:
                    "string",

                  enum: [
                    "Proceed to review",
                    "Request clarification",
                    "Request alternative quotation",
                    "Escalate for additional review"
                  ]
                },

                budgetObservation: {
                  type:
                    "string",

                  description:
                    "An advisory budget observation without inventing availability or limits."
                },

                missingInformation: {
                  type:
                    "array",

                  description:
                    "Only materially relevant missing details. Return an empty array when nothing important is missing.",

                  items: {
                    type:
                      "string"
                  }
                },

                suggestedQuestions: {
                  type:
                    "array",

                  description:
                    "Questions directly relevant to the supplied request.",

                  items: {
                    type:
                      "string"
                  }
                }
              }
            }
          }
        });

      const analysis =
        parseGeminiJson(
          response
        );

      const normalizedResult =
        normalizeAnalysis(
          analysis
        );

      return res
        .status(200)
        .json(
          normalizedResult
        );
    } catch (error) {
      const details =
        getGeminiErrorDetails(
          error
        );

      console.error(
        "Gemini purchase analysis failed:",
        error
      );

      return res.status(500).json({
        error:
          "AI_ANALYSIS_FAILED",

        message:
          details.message,

        upstreamStatus:
          details.status,

        errorName:
          details.errorName,

        model:
          GEMINI_MODEL,

        aiAnalysisStatus:
          "FAILED"
      });
    }
  }
);

/* =========================================================
 * Invalid JSON handler
 * ======================================================= */

app.use(
  (error, req, res, next) => {
    if (
      error instanceof SyntaxError &&
      error.status === 400 &&
      "body" in error
    ) {
      return res.status(400).json({
        error:
          "INVALID_JSON",

        message:
          "The supplied request body is not valid JSON."
      });
    }

    console.error(
      "Unhandled server error:",
      error
    );

    return res.status(500).json({
      error:
        "INTERNAL_SERVER_ERROR",

      message:
        "An unexpected server error occurred."
    });
  }
);

/* =========================================================
 * Unknown endpoint handler
 * ======================================================= */

app.use((req, res) => {
  return res.status(404).json({
    error:
      "NOT_FOUND",

    message:
      `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

/* =========================================================
 * Start server
 * ======================================================= */

app.listen(PORT, () => {
  const missingBpaConfiguration =
    getMissingBpaConfiguration();

  console.log(
    `PR AI and BPA integration service running on port ${PORT}`
  );

  console.log(
    `Gemini model: ${GEMINI_MODEL}`
  );

  console.log(
    `Gemini key configured: ${Boolean(
      GEMINI_API_KEY
    )}`
  );

  console.log(
    `Gemini configuration source: ${
      process.env.GEMINI_API_KEY
        ? "environment variable"
        : GEMINI_API_KEY
          ? "pr-gemini-secrets bound service"
          : "not configured"
    }`
  );

  console.log(
    `BPA trigger configured: ${
      missingBpaConfiguration.length === 0
    }`
  );

  if (
    missingBpaConfiguration.length > 0
  ) {
    console.log(
      `Missing BPA configuration: ${missingBpaConfiguration.join(
        ", "
      )}`
    );
  }
});