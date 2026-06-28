# 🚀 AI-Enabled Purchase Requisition Approval

A complete SAP BTP Cloud Foundry solution for creating, analyzing, routing, and approving purchase requisitions.

***

## 🌐 Live Application

```
https://6e95c1f4trial-dev-pr-finance-approval-approuter.cfapps.us10-001.hana.ondemand.com/commaazprapprovalprrequestui/index.html
```

> ⚠️ This project is deployed on an SAP BTP **Trial Account**. Applications may stop automatically. Restart the approuter and backend when required.

***

## 📌 Project Overview

This project digitizes and automates the **Purchase Requisition (PR) approval workflow**.

### Flow Summary:

1. Employee submits a request via SAPUI5 UI
2. Request is routed through a secure approuter
3. Backend validates & triggers workflow
4. SAP Build Process Automation handles approvals
5. Gemini AI provides advisory insights
6. Department & Finance approvals are completed
7. Final status and audit trail are stored

> 🤖 **Gemini AI is advisory only** — final decisions are made by human reviewers.

***

## 🏗️ Architecture

```
User Browser
     |
     v
Standalone Approuter
     |
     +--> XSUAA Authentication
     |
     +--> HTML5 App Repository
     |        |
     |        +--> Request UI
     |        +--> Dept Approval UI
     |        +--> Finance Approval UI
     |
     +--> PR_AI_SERVICE Destination
              |
              v
        Node.js Backend
              |
              +--> Gemini AI
              |
              +--> SAP Build Process Automation
                        |
                        +--> Dept Approval Task
                        +--> Finance Task
                        +--> Monitoring & Audit
```

***

## 🔄 End-to-End Flow

1. User opens application URL
2. Approuter redirects to XSUAA login
3. User logs in
4. SAPUI5 app loads
5. User submits purchase request
6. API call → `/api/purchase-requests`
7. Backend validates & triggers workflow
8. BPA generates Request ID
9. Gemini AI performs analysis
10. Department approval → Finance approval
11. Final status stored

***

## 🧩 Main Components

### 🧑‍💻 1. Requester SAPUI5 App (`pr-request-ui`)

**Purpose:**

* Capture request details
* Validate input
* Submit purchase requests
* Display workflow status

**Key Files:**

```
webapp/
 ├── controller/App.controller.js
 ├── view/App.view.xml
 ├── manifest.json
 ├── Component.js
 └── index.html
```

***

### 🏢 2. Department Approval UI (`pr-dept-approval-ui`)

* View request details
* See AI insights
* Approve / Reject
* Add comments

***

### 💰 3. Finance Approval UI (`pr-finance-approval-ui`)

* Final approval authority
* View Department decision
* Validate financial data

***

### 🔀 4. Standalone Approuter (`approuter/`)

**Responsibilities:**

* Authentication via XSUAA
* Routing requests
* Serving UI apps
* Securing endpoints

**Sample Route:**

```json
{
  "source": "^/api/(.*)$",
  "target": "/api/$1",
  "destination": "PR_AI_SERVICE",
  "authenticationType": "xsuaa",
  "csrfProtection": false
}
```

***

### ⚙️ 5. Node.js Backend (`pr-ai-service`)

**Responsibilities:**

* Validate payload
* Call Gemini AI
* Trigger BPA workflow
* Return workflow instance ID

**Endpoints:**

```
GET    /
GET    /health
GET    /api/ai/test
POST   /api/ai/analyze-purchase
POST   /api/purchase-requests
```

***

### 🔄 6. SAP Build Process Automation

Workflow ID:

```
us10.6e95c1f4trial.purchaserequisitionapproval.namePRFinanceApprovalProcess
```

**Steps:**

1. API Trigger
2. Generate Request ID
3. AI Analysis
4. Department Approval
5. Finance Approval
6. Final Status

***

### 🤖 7. Gemini AI

**Outputs:**

* Summary
* Risk Level
* Recommendation
* Budget Observation
* Missing Data
* Suggested Questions

***

## 📁 Project Structure

```
pr-finance-approval/
├── ai-service/
├── approuter/
├── pr-request-ui/
├── pr-dept-approval-ui/
├── pr-finance-approval-ui/
├── resources/
├── xs-security.json
├── mta.yaml
└── README.md
```

***

## ☁️ SAP BTP Services

* Destination Service (`PR_AI_SERVICE`)
* HTML5 App Repo (host + runtime)
* XSUAA
* SAP BPA OAuth Service
* Gemini Secret Storage

***

## ✅ Prerequisites

* SAP BTP (CF environment)
* Node.js & npm
* Cloud Foundry CLI
* MBT Build Tool
* SAP BAS

Check versions:

```bash
node --version
npm --version
cf --version
mbt --version
```

***

## 🔐 Cloud Foundry Login

```bash
cf login -a https://api.cf.us10-001.hana.ondemand.com --sso
```

***

## 🏗️ Build

```bash
mbt build
```

Output:

```
mta_archives/pr-finance-approval_0.0.1.mtar
```

***

## 🚀 Deploy

```bash
cf deploy mta_archives/pr-finance-approval_0.0.1.mtar
```

***

## ▶️ Start Apps

```bash
cf start pr-ai-service
cf start pr-finance-approval-approuter
```

***

## ⏹️ Stop Apps

```bash
cf stop pr-ai-service
cf stop pr-finance-approval-approuter
```

***

## 🔁 Restart

```bash
cf restart pr-ai-service
cf restart pr-finance-approval-approuter
```

***

## 🧪 Test the App

1. Open URL
2. Login
3. Submit request
4. Copy workflow ID
5. Verify in BPA
6. Approve via My Inbox

***

## 🧾 Sample Data

```
Employee: Mohammed Maaz A
Department: IT
Item: Laptop
Quantity: 3
Cost: 240000
Project: Automation Project
```

***

## ⚠️ Common Issues

| Issue           | Fix              |
| --------------- | ---------------- |
| App not loading | Start approuter  |
| Submit failed   | Start backend    |
| Auth error      | Update XSUAA     |
| Apps stopped    | Restart manually |

***

## 🔐 Security Notes

❌ Never commit:

* API Keys
* OAuth secrets
* `.env` files

✅ `.gitignore`

```
node_modules/
.env
*.log
mta_archives/
```

***

## 🔄 cf deploy vs cf start

| Command   | Purpose              |
| --------- | -------------------- |
| cf deploy | Upload + deploy code |
| cf start  | Start existing app   |

***

## 🆚 Approuter vs Backend

| Approuter     | Backend          |
| ------------- | ---------------- |
| Entry point   | Processing logic |
| Auth handling | Business logic   |
| UI serving    | AI + BPA calls   |

***

## 🚀 Future Improvements

* Role-based access
* Email alerts
* Budget validation
* PDF generation
* Analytics dashboard
* S/4HANA integration

***

## 👨‍💻 Author

**Mohammed Maaz A**

**Tech Stack:**

* SAP BTP
* SAPUI5
* Node.js
* Gemini AI
* Cloud Foundry

***

## 📜 License

This project is intended for:

* Learning
* Portfolio
* Demonstration

> Add a proper license before production use.

***
