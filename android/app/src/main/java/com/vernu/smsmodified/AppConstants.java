package com.vernu.smsmodified;

import android.Manifest;

public class AppConstants {
    // 100.77.145.14
    public static final String API_BASE_URL = "http://100.77.145.14:3005/api/v1/";
    public static final String[] requiredPermissions = new String[]{
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_PHONE_STATE
    };
    public static final String SHARED_PREFS_DEVICE_ID_KEY = "DEVICE_ID";
    public static final String SHARED_PREFS_API_KEY_KEY = "API_KEY";
    public static final String SHARED_PREFS_GATEWAY_ENABLED_KEY = "GATEWAY_ENABLED";
    public static final String SHARED_PREFS_PREFERRED_SIM_KEY = "PREFERRED_SIM";
    public static final String SHARED_PREFS_RECEIVE_SMS_ENABLED_KEY = "RECEIVE_SMS_ENABLED";
    public static final String SHARED_PREFS_TRACK_SENT_SMS_STATUS_KEY = "TRACK_SENT_SMS_STATUS";
}
