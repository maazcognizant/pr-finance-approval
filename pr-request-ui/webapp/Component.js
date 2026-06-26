sap.ui.define([
  "sap/ui/core/UIComponent",
  "com/maaz/prapproval/prrequestui/model/models"
], function (UIComponent, models) {
  "use strict";

  return UIComponent.extend("com.maaz.prapproval.prrequestui.Component", {
    metadata: { manifest: "json" },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(models.createDeviceModel(), "device");
      this.setModel(models.createRequestModel(), "request");
      this.getRouter().initialize();
    }
  });
});
