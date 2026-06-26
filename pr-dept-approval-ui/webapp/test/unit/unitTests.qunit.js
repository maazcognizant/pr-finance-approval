/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"commaazprapproval/pr-dept-approval-ui/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
