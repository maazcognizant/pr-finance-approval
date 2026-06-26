sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
  ],
  function (
    Controller,
    MessageBox,
    MessageToast
  ) {
    "use strict";

    return Controller.extend(
      "com.maaz.prapproval.prrequestui.controller.App",
      {
        onInit: function () {
          this._oRequestModel =
            this.getOwnerComponent().getModel("request");
        },

        onPurchaseTypeChange: function () {
          var sPurchaseType =
            this._oRequestModel.getProperty("/purchaseType");

          if (sPurchaseType !== "Project Purchase") {
            this._oRequestModel.setProperty("/projectName", "");
            this._oRequestModel.setProperty("/projectId", "");
          }
        },

        /**
         * Validate and submit the purchase requisition.
         */
        onSubmit: function () {
          var oFormData =
            Object.assign(
              {},
              this._oRequestModel.getData()
            );

          var aMissingFields =
            this._validateRequiredFields(oFormData);

          if (aMissingFields.length > 0) {
            MessageBox.warning(
              "Complete the following required fields:\n\n" +
                aMissingFields.join("\n")
            );

            return;
          }

          if (!this._isValidEmail(oFormData.employeeEmail)) {
            MessageBox.warning(
              "Enter a valid employee email address."
            );

            return;
          }

          if (Number(oFormData.quantity) < 1) {
            MessageBox.warning(
              "Quantity must be at least 1."
            );

            return;
          }

          if (Number(oFormData.estimatedCost) < 0) {
            MessageBox.warning(
              "Estimated cost cannot be negative."
            );

            return;
          }

          var oPayload =
            this._buildPayload(oFormData);

          this._oRequestModel.setProperty(
            "/submitting",
            true
          );

          jQuery.ajax({
            url: "/api/purchase-requests",
            method: "POST",
            contentType: "application/json",
            dataType: "json",
            data: JSON.stringify(oPayload)
          })
            .done(
              function (oResponse) {
                var sProcessInstanceId =
                  oResponse.processInstanceId ||
                  oResponse.id ||
                  "Not available";

                var sWorkflowStatus =
                  oResponse.status ||
                  "RUNNING";

                this._oRequestModel.setProperty(
                  "/processInstanceId",
                  sProcessInstanceId
                );

                this._oRequestModel.setProperty(
                  "/workflowStatus",
                  sWorkflowStatus
                );

                this._oRequestModel.setProperty(
                  "/submitted",
                  true
                );

                MessageBox.success(
                  "Purchase request submitted successfully.\n\n" +
                    "The request has entered the approval workflow.\n\n" +
                    "Workflow Status: " +
                    sWorkflowStatus +
                    "\n\nProcess Instance ID:\n" +
                    sProcessInstanceId,
                  {
                    title: "Request Submitted",
                    emphasizedAction:
                      MessageBox.Action.OK,

                    onClose:
                      function () {
                        this._resetForm();

                        MessageToast.show(
                          "The form has been reset and is ready for a new request."
                        );
                      }.bind(this)
                  }
                );
              }.bind(this)
            )
            .fail(
              function (oError) {
                var sErrorMessage =
                  "The purchase request could not be submitted.";

                try {
                  var oErrorBody =
                    JSON.parse(
                      oError.responseText
                    );

                  sErrorMessage =
                    oErrorBody.message ||
                    oErrorBody.error ||
                    sErrorMessage;
                } catch (oParseError) {
                  console.error(
                    "Unable to parse submission error:",
                    oParseError
                  );
                }

                MessageBox.error(
                  sErrorMessage,
                  {
                    title:
                      "Submission Failed"
                  }
                );
              }
            )
            .always(
              function () {
                this._oRequestModel.setProperty(
                  "/submitting",
                  false
                );
              }.bind(this)
            );
        },

        /**
         * Manually clear the form.
         */
        onReset: function () {
          MessageBox.confirm(
            "Clear all values entered in the purchase request form?",
            {
              title: "Reset Form",

              actions: [
                MessageBox.Action.RESET,
                MessageBox.Action.CANCEL
              ],

              emphasizedAction:
                MessageBox.Action.CANCEL,

              onClose:
                function (sAction) {
                  if (
                    sAction ===
                    MessageBox.Action.RESET
                  ) {
                    this._resetForm();

                    MessageToast.show(
                      "Purchase request form cleared."
                    );
                  }
                }.bind(this)
            }
          );
        },

        /**
         * Reset all model values.
         */
        _resetForm: function () {
          this._oRequestModel.setData({
            employeeName: "",
            employeeId: "",
            employeeEmail: "",
            department: "",
            itemName: "",
            quantity: 1,
            estimatedCost: null,
            businessReason: "",
            requiredDate: "",
            purchaseType:
              "Department Purchase",
            projectName: "",
            projectId: "",
            costCentre: "",
            vendorName: "",
            vendorPreference: "",
            submitting: false,
            submitted: false,
            processInstanceId: "",
            workflowStatus: ""
          });
        },

        _validateRequiredFields: function (
          oData
        ) {
          var aRequiredFields = [
            [
              "Employee Name",
              oData.employeeName
            ],
            [
              "Employee Email",
              oData.employeeEmail
            ],
            [
              "Department",
              oData.department
            ],
            [
              "Item Name",
              oData.itemName
            ],
            [
              "Quantity",
              oData.quantity
            ],
            [
              "Estimated Cost",
              oData.estimatedCost
            ],
            [
              "Business Reason",
              oData.businessReason
            ],
            [
              "Required Date",
              oData.requiredDate
            ]
          ];

          return aRequiredFields
            .filter(function (aField) {
              return (
                aField[1] === null ||
                aField[1] === undefined ||
                String(aField[1]).trim() === ""
              );
            })
            .map(function (aField) {
              return "• " + aField[0];
            });
        },

        _isValidEmail: function (sEmail) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            String(sEmail || "").trim()
          );
        },

        _buildPayload: function (oData) {
          var oPayload = {
            employeeName:
              String(
                oData.employeeName
              ).trim(),

            employeeId:
              String(
                oData.employeeId || ""
              ).trim(),

            employeeEmail:
              String(
                oData.employeeEmail
              ).trim(),

            department:
              String(
                oData.department
              ).trim(),

            itemName:
              String(
                oData.itemName
              ).trim(),

            quantity:
              Number(oData.quantity),

            estimatedCost:
              Number(
                oData.estimatedCost
              ),

            businessReason:
              String(
                oData.businessReason
              ).trim(),

            requiredDate:
              oData.requiredDate,

            purchaseType:
              String(
                oData.purchaseType || ""
              ).trim(),

            projectName:
              String(
                oData.projectName || ""
              ).trim(),

            projectId:
              String(
                oData.projectId || ""
              ).trim(),

            costCentre:
              String(
                oData.costCentre || ""
              ).trim(),

            vendorName:
              String(
                oData.vendorName || ""
              ).trim(),

            vendorPreference:
              String(
                oData.vendorPreference || ""
              ).trim()
          };

          Object.keys(oPayload).forEach(
            function (sProperty) {
              if (
                oPayload[sProperty] === ""
              ) {
                delete oPayload[sProperty];
              }
            }
          );

          return oPayload;
        }
      }
    );
  }
);