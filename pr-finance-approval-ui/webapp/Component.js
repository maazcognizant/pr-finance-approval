sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device",
    "sap/m/MessageBox",
    "com/maaz/prapproval/prfinanceapprovalui/model/models"
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
      "com.maaz.prapproval.prfinanceapprovalui.Component",
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
         * Load the complete Finance task context.
         *
         * All mapped inputs, including optional business fields,
         * Department Head outputs and AI results, are available
         * through the named "context" model.
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
              "The Finance task information could not be loaded."
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
                "/financeComment"
              ) || ""
            ).trim();

          if (!sComment) {
            MessageBox.warning(
              "Enter a Finance comment before approving or rejecting the request."
            );

            return;
          }

          oContextModel.setProperty(
            "/financeComment",
            sComment
          );

          oContextModel.setProperty(
            "/approved",
            bApprovalStatus
          );

          oContextModel.setProperty(
            "/financeApproved",
            bApprovalStatus
          );

          oContextModel.setProperty(
            "/financeDecision",
            bApprovalStatus
              ? "Approved by Finance"
              : "Rejected by Finance"
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

          oContext.financeComment =
            oContext.financeComment || "";

          oContext.financeDecision =
            oContext.financeDecision ||
            (
              sOutcomeId === "approve"
                ? "Approved by Finance"
                : "Rejected by Finance"
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
                "Unable to complete Finance task:",
                oError
              );

              MessageBox.error(
                "The Finance task could not be completed. Check the workflow logs and try again."
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