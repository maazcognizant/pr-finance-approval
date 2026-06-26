sap.ui.define(["sap/ui/model/json/JSONModel", "sap/ui/Device"], function (JSONModel, Device) {
  "use strict";

  function createDeviceModel() {
    var oModel = new JSONModel(Device);
    oModel.setDefaultBindingMode("OneWay");
    return oModel;
  }

  function createRequestModel() {
    return new JSONModel({
      employeeName: "",
      employeeId: "",
      employeeEmail: "",
      department: "",
      itemName: "",
      quantity: 1,
      estimatedCost: null,
      businessReason: "",
      requiredDate: "",
      purchaseType: "Department Purchase",
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
  }

  return { createDeviceModel: createDeviceModel, createRequestModel: createRequestModel };
});
