sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device",
    "sap/m/MessageBox",
    "com/maaz/prapproval/prdeptapprovalui/model/models"
  ],
  function (
    UIComponent,
    JSONModel,
    Device,
    MessageBox,
    models
  ) {
    "use strict";

    return UIComponent.extend(
      "com.maaz.prapproval.prdeptapprovalui.Component",
      {
        metadata: {
          manifest: "json"
        },

        init: function () {
          UIComponent.prototype.init.apply(
            this,
            arguments
          );

          this.getRouter().initialize();

          this.setModel(
            models.createDeviceModel(),
            "device"
          );

          this.setTaskModels();
          this.registerInboxActions();
        },

        /**
         * Register Department Head approval actions in My Inbox.
         */
        registerInboxActions: function () {
          var oInboxAPI = this.getInboxAPI();

          oInboxAPI.addAction(
            {
              action: "approve",
              label: "Approve",
              type: "accept"
            },
            function () {
              this.completeTask(
                true,
                "approve"
              );
            },
            this
          );

          oInboxAPI.addAction(
            {
              action: "reject",
              label: "Reject",
              type: "reject"
            },
            function () {
              this.completeTask(
                false,
                "reject"
              );
            },
            this
          );
        },

        /**
         * Load the complete workflow task context.
         *
         * All mapped task inputs, including new optional fields and
         * AI outputs, become available through the "context" model.
         */
        setTaskModels: function () {
          var oComponentData =
            this.getComponentData();

          var oStartupParameters =
            oComponentData &&
            oComponentData.startupParameters;

          if (
            !oStartupParameters ||
            !oStartupParameters.taskModel
          ) {
            MessageBox.error(
              "The workflow task information could not be loaded."
            );

            return;
          }

          this.setModel(
            oStartupParameters.taskModel,
            "task"
          );

          var oTaskContextModel =
            new JSONModel();

          oTaskContextModel.loadData(
            this._getTaskInstancesBaseURL() +
              "/context"
          );

          oTaskContextModel.attachRequestFailed(
            function () {
              MessageBox.error(
                "The purchase request context could not be loaded."
              );
            }
          );

          this.setModel(
            oTaskContextModel,
            "context"
          );
        },

        _getTaskInstancesBaseURL: function () {
          return (
            this._getWorkflowRuntimeBaseURL() +
            "/task-instances/" +
            this.getTaskInstanceID()
          );
        },

        _getWorkflowRuntimeBaseURL: function () {
          var sAppId =
            this.getManifestEntry(
              "/sap.app/id"
            );

          var sAppPath =
            sAppId.split(".").join("/");

          var sAppModulePath =
            sap.ui.require.toUrl(sAppPath);

          return (
            sAppModulePath +
            "/bpmworkflowruntime/v1"
          );
        },

        getTaskInstanceID: function () {
          var oTaskModel =
            this.getModel("task");

          return oTaskModel
            .getData()
            .InstanceID;
        },

        getInboxAPI: function () {
          var oComponentData =
            this.getComponentData();

          return oComponentData
            .startupParameters
            .inboxAPI;
        },

        /**
         * Validate the Department Head comment and complete the task.
         */
        completeTask: function (
          bApprovalStatus,
          sOutcomeId
        ) {
          var oContextModel =
            this.getModel("context");

          if (!oContextModel) {
            MessageBox.error(
              "The task context is not available."
            );

            return;
          }

          var sComment =
            String(
              oContextModel.getProperty(
                "/deptHeadComment"
              ) || ""
            ).trim();

          if (!sComment) {
            MessageBox.warning(
              "Enter a Department Head comment before approving or rejecting the request."
            );

            return;
          }

          oContextModel.setProperty(
            "/deptHeadComment",
            sComment
          );

          oContextModel.setProperty(
            "/approved",
            bApprovalStatus
          );

          oContextModel.setProperty(
            "/deptHeadApproved",
            bApprovalStatus
          );

          oContextModel.setProperty(
            "/deptHeadDecision",
            bApprovalStatus
              ? "Approved by Department Head"
              : "Rejected by Department Head"
          );

          this._patchTaskInstance(
            sOutcomeId
          );
        },

        _patchTaskInstance: function (
          sOutcomeId
        ) {
          var oContext =
            this.getModel("context")
              .getData();

          oContext.deptHeadComment =
            oContext.deptHeadComment || "";

          oContext.deptHeadDecision =
            oContext.deptHeadDecision ||
            (
              sOutcomeId === "approve"
                ? "Approved by Department Head"
                : "Rejected by Department Head"
            );

          var oPayload = {
            status: "COMPLETED",
            context: oContext,
            decision: sOutcomeId
          };

          jQuery.ajax({
            url:
              this._getTaskInstancesBaseURL(),
            method: "PATCH",
            contentType:
              "application/json",
            data:
              JSON.stringify(oPayload),
            headers: {
              "X-CSRF-Token":
                this._fetchToken()
            }
          })
            .done(
              function () {
                this._refreshTaskList();
              }.bind(this)
            )
            .fail(function (oError) {
              console.error(
                "Unable to complete Department Head task:",
                oError
              );

              MessageBox.error(
                "The task could not be completed. Check the workflow logs and try again."
              );
            });
        },

        _fetchToken: function () {
          var sFetchedToken = "";

          jQuery.ajax({
            url:
              this._getWorkflowRuntimeBaseURL() +
              "/xsrf-token",
            method: "GET",
            async: false,
            headers: {
              "X-CSRF-Token": "Fetch"
            },
            success: function (
              oResult,
              sStatus,
              oResponse
            ) {
              sFetchedToken =
                oResponse.getResponseHeader(
                  "X-CSRF-Token"
                );
            },
            error: function (oError) {
              console.error(
                "Unable to fetch X-CSRF token:",
                oError
              );
            }
          });

          return sFetchedToken;
        },

        _refreshTaskList: function () {
          this.getInboxAPI().updateTask(
            "NA",
            this.getTaskInstanceID()
          );
        }
      }
    );
  }
);