package com.vernu.smsmodified.activities;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import com.google.android.material.snackbar.Snackbar;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.vernu.smsmodified.ApiManager;
import com.vernu.smsmodified.AppConstants;
import com.vernu.smsmodified.BuildConfig;
import com.vernu.smsmodified.TextBeeUtils;
import com.vernu.smsmodified.R;
import com.vernu.smsmodified.dtos.GetConfigDTO;
import com.vernu.smsmodified.dtos.RegisterDeviceInputDTO;
import com.vernu.smsmodified.dtos.RegisterDeviceResponseDTO;
import com.vernu.smsmodified.dtos.SendLogDTO;
import com.vernu.smsmodified.helpers.SharedPreferenceHelper;
import java.util.Arrays;
import java.util.Objects;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;
import com.vernu.smsmodified.services.MachineCodeGenerator;
import com.vernu.smsmodified.services.NetworkUtils;

import android.os.Handler;
import android.os.HandlerThread;

import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import androidx.work.Data;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

public class MainActivity extends AppCompatActivity {
    private HandlerThread handlerThread;
    private Handler handler;
    private Context mContext;
    private Switch gatewaySwitch, receiveSMSSwitch;
    private EditText apiKeyEditText, fcmTokenEditText;
    private Button registerDeviceBtn, grantSMSPermissionBtn, scanQRBtn;
    private ImageButton copyDeviceIdImgBtn;
    private TextView deviceBrandAndModelTxt, deviceIdTxt;
    private RadioGroup defaultSimSlotRadioGroup;
    private static final int SCAN_QR_REQUEST_CODE = 49374;
    private static final int PERMISSION_REQUEST_CODE = 0;
    private String deviceId = null;
    private String username = null;
    private String password = null;
    private String machineKey = null;
    private String port = null;

    private String ip = null;
    private static final String TAG = "MainActivity";


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        mContext = getApplicationContext();
        deviceId = SharedPreferenceHelper.getSharedPreferenceString(mContext, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, "");
        setContentView(R.layout.activity_main);
        gatewaySwitch = findViewById(R.id.gatewaySwitch);
        receiveSMSSwitch = findViewById(R.id.receiveSMSSwitch);
        apiKeyEditText = findViewById(R.id.apiKeyEditText);
        fcmTokenEditText = findViewById(R.id.fcmTokenEditText);
        registerDeviceBtn = findViewById(R.id.registerDeviceBtn);
        grantSMSPermissionBtn = findViewById(R.id.grantSMSPermissionBtn);
        scanQRBtn = findViewById(R.id.scanQRButton);
        deviceBrandAndModelTxt = findViewById(R.id.deviceBrandAndModelTxt);
        deviceIdTxt = findViewById(R.id.deviceIdTxt);
        copyDeviceIdImgBtn = findViewById(R.id.copyDeviceIdImgBtn);
        defaultSimSlotRadioGroup = findViewById(R.id.defaultSimSlotRadioGroup);

        deviceIdTxt.setText(deviceId);
        deviceBrandAndModelTxt.setText(Build.BRAND + " " + Build.MODEL);
        machineKey = MachineCodeGenerator.generateMachineKey();

        ip = NetworkUtils.getTun0IpAddress();

        if (deviceId == null || deviceId.isEmpty()) {
            registerDeviceBtn.setText("Register");
        } else {
            registerDeviceBtn.setText("Update");
        }

        String[] missingPermissions = Arrays.stream(AppConstants.requiredPermissions).filter(permission -> !TextBeeUtils.isPermissionGranted(mContext, permission)).toArray(String[]::new);
        if (missingPermissions.length == 0) {
            grantSMSPermissionBtn.setEnabled(false);
            grantSMSPermissionBtn.setText("Permission Granted");
            renderAvailableSimOptions();
        } else {
            Snackbar.make(grantSMSPermissionBtn, "Please Grant Required Permissions to continue: " + Arrays.toString(missingPermissions), Snackbar.LENGTH_SHORT).show();
            grantSMSPermissionBtn.setEnabled(true);
            grantSMSPermissionBtn.setOnClickListener(this::handleRequestPermissions);
        }

//        TextBeeUtils.startStickyNotificationService(mContext);

        copyDeviceIdImgBtn.setOnClickListener(view -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newPlainText("Device ID", deviceId);
            clipboard.setPrimaryClip(clip);
            Snackbar.make(view, "Copied", Snackbar.LENGTH_LONG).show();
        });

        apiKeyEditText.setText(SharedPreferenceHelper.getSharedPreferenceString(mContext, AppConstants.SHARED_PREFS_API_KEY_KEY, ""));
        gatewaySwitch.setChecked(SharedPreferenceHelper.getSharedPreferenceBoolean(mContext, AppConstants.SHARED_PREFS_GATEWAY_ENABLED_KEY, false));
        gatewaySwitch.setOnCheckedChangeListener((compoundButton, isCheked) -> {
            View view = compoundButton.getRootView();
            compoundButton.setEnabled(false);
            String key = apiKeyEditText.getText().toString();

            RegisterDeviceInputDTO registerDeviceInput = new RegisterDeviceInputDTO();
            registerDeviceInput.setEnabled(isCheked);
            registerDeviceInput.setAppVersionCode(BuildConfig.VERSION_CODE);
            registerDeviceInput.setAppVersionName(BuildConfig.VERSION_NAME);

            Call<RegisterDeviceResponseDTO> apiCall = ApiManager.getApiService().updateDevice(deviceId, key, registerDeviceInput);
            apiCall.enqueue(new Callback<RegisterDeviceResponseDTO>() {
                @Override
                public void onResponse(Call<RegisterDeviceResponseDTO> call, Response<RegisterDeviceResponseDTO> response) {
                    Log.d(TAG, response.toString());
                    if (!response.isSuccessful()) {
                        Snackbar.make(view, response.message(), Snackbar.LENGTH_LONG).show();
                        compoundButton.setEnabled(true);
                        return;
                    }
                    Snackbar.make(view, "Gateway " + (isCheked ? "enabled" : "disabled"), Snackbar.LENGTH_LONG).show();
                    SharedPreferenceHelper.setSharedPreferenceBoolean(mContext, AppConstants.SHARED_PREFS_GATEWAY_ENABLED_KEY, isCheked);
                    boolean enabled = Boolean.TRUE.equals(Objects.requireNonNull(response.body()).data.get("enabled"));
                    compoundButton.setChecked(enabled);
//                    if (enabled) {
//                        TextBeeUtils.startStickyNotificationService(mContext);
//                    } else {
//                        TextBeeUtils.stopStickyNotificationService(mContext);
//                    }
                    compoundButton.setEnabled(true);
                }
                @Override
                public void onFailure(Call<RegisterDeviceResponseDTO> call, Throwable t) {
                    Snackbar.make(view, "An error occured :(", Snackbar.LENGTH_LONG).show();
                    compoundButton.setEnabled(true);
                }
            });
        });

        receiveSMSSwitch.setChecked(SharedPreferenceHelper.getSharedPreferenceBoolean(mContext, AppConstants.SHARED_PREFS_RECEIVE_SMS_ENABLED_KEY, false));
        receiveSMSSwitch.setOnCheckedChangeListener((compoundButton, isCheked) -> {
            View view = compoundButton.getRootView();
            SharedPreferenceHelper.setSharedPreferenceBoolean(mContext, AppConstants.SHARED_PREFS_RECEIVE_SMS_ENABLED_KEY, isCheked);
            compoundButton.setChecked(isCheked);
            Snackbar.make(view, "Receive SMS " + (isCheked ? "enabled" : "disabled"), Snackbar.LENGTH_LONG).show();
        });

        // TODO: check gateway status/api key/device validity and update UI accordingly
        registerDeviceBtn.setOnClickListener(view -> handleRegisterDevice());
        scanQRBtn.setOnClickListener(view -> {
            IntentIntegrator intentIntegrator = new IntentIntegrator(MainActivity.this);
            intentIntegrator.setPrompt("Go to textbee.dev/dashboard and click Register Device to generate QR Code");
            intentIntegrator.setRequestCode(SCAN_QR_REQUEST_CODE);
            intentIntegrator.initiateScan();
        });

        WorkManager workManager = WorkManager.getInstance(mContext);

                // Query ongoing work
        workManager.getWorkInfosByTagLiveData("StartPythonServerWorker")
                        .observe(MainActivity.this, workInfos -> {
                    boolean isRunning = false;
                    for (WorkInfo workInfo : workInfos) {
                        if (workInfo.getState() == WorkInfo.State.RUNNING || workInfo.getState() == WorkInfo.State.ENQUEUED) {
                            isRunning = true;
                            break;
                        }
                    }

                    if (!isRunning) {
                        // Create and enqueue the work request
                        OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(StartPythonServerWorker.class)
                                .addTag("StartPythonServerWorker")
                                .build();
                        workManager.enqueue(workRequest);
                    }
                });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
    }

    private void renderAvailableSimOptions() {
        try {
            defaultSimSlotRadioGroup.removeAllViews();
            RadioButton defaultSimSlotRadioBtn = new RadioButton(mContext);
            defaultSimSlotRadioBtn.setText("Device Default");
            defaultSimSlotRadioBtn.setId((int)123456);
            defaultSimSlotRadioGroup.addView(defaultSimSlotRadioBtn);
            TextBeeUtils.getAvailableSimSlots(mContext).forEach(subscriptionInfo -> {
                String simInfo = "SIM " + (subscriptionInfo.getSimSlotIndex() + 1) + " (" + subscriptionInfo.getDisplayName() + ")";
                RadioButton radioButton = new RadioButton(mContext);
                radioButton.setText(simInfo);
                radioButton.setId(subscriptionInfo.getSubscriptionId());
                defaultSimSlotRadioGroup.addView(radioButton);
            });

            int preferredSim = SharedPreferenceHelper.getSharedPreferenceInt(mContext, AppConstants.SHARED_PREFS_PREFERRED_SIM_KEY, -1);
            if (preferredSim == -1) {
                defaultSimSlotRadioGroup.check(defaultSimSlotRadioBtn.getId());
            } else {
                defaultSimSlotRadioGroup.check(preferredSim);
            }
            defaultSimSlotRadioGroup.setOnCheckedChangeListener((radioGroup, i) -> {
                RadioButton radioButton = findViewById(i);
                if (radioButton == null) {
                    return;
                }
                radioButton.setChecked(true);
                if("Device Default".equals(radioButton.getText().toString())) {
                    SharedPreferenceHelper.clearSharedPreference(mContext, AppConstants.SHARED_PREFS_PREFERRED_SIM_KEY);
                } else {
                    SharedPreferenceHelper.setSharedPreferenceInt(mContext, AppConstants.SHARED_PREFS_PREFERRED_SIM_KEY, radioButton.getId());
                }
            });
        } catch (Exception e) {
            Snackbar.make(defaultSimSlotRadioGroup.getRootView(), "Error: " + e.getMessage(), Snackbar.LENGTH_LONG).show();
            Log.e(TAG, "SIM_SLOT_ERROR "+ e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String permissions[], int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != PERMISSION_REQUEST_CODE) {
            return;
        }
        boolean allPermissionsGranted = Arrays.stream(permissions).allMatch(permission -> TextBeeUtils.isPermissionGranted(mContext, permission));
        if (allPermissionsGranted) {
            Snackbar.make(findViewById(R.id.grantSMSPermissionBtn), "All Permissions Granted", Snackbar.LENGTH_SHORT).show();
            grantSMSPermissionBtn.setEnabled(false);
            grantSMSPermissionBtn.setText("Permission Granted");
            renderAvailableSimOptions();
        } else {
            Snackbar.make(findViewById(R.id.grantSMSPermissionBtn), "Please Grant Required Permissions to continue", Snackbar.LENGTH_SHORT).show();
        }
    }

    private void handleRegisterDevice() {
        ip = NetworkUtils.getTun0IpAddress();
        String newKey = apiKeyEditText.getText().toString();
        registerDeviceBtn.setEnabled(false);
        registerDeviceBtn.setText("Loading...");
        View view = findViewById(R.id.registerDeviceBtn);

        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        Snackbar.make(view, "Failed to obtain FCM Token :(", Snackbar.LENGTH_LONG).show();
                        registerDeviceBtn.setEnabled(true);
                        registerDeviceBtn.setText("Update");
                        return;
                    }
                    String token = task.getResult();
                    fcmTokenEditText.setText(token);

                    RegisterDeviceInputDTO registerDeviceInput = new RegisterDeviceInputDTO();
                    registerDeviceInput.setEnabled(true);
                    registerDeviceInput.setFcmToken(token);
                    registerDeviceInput.setBrand(Build.BRAND);
                    registerDeviceInput.setManufacturer(Build.MANUFACTURER);
                    registerDeviceInput.setModel(Build.MODEL);
                    registerDeviceInput.setBuildId(Build.ID);
                    registerDeviceInput.setOs(Build.VERSION.BASE_OS);
                    registerDeviceInput.setAppVersionCode(BuildConfig.VERSION_CODE);
                    registerDeviceInput.setAppVersionName(BuildConfig.VERSION_NAME);
                    registerDeviceInput.setMachineKey(machineKey);
                    registerDeviceInput.setIp(ip);

                    Call<RegisterDeviceResponseDTO> apiCall = ApiManager.getApiService().registerDevice(newKey, registerDeviceInput);
                    apiCall.enqueue(new Callback<RegisterDeviceResponseDTO>() {
                        @Override
                        public void onResponse(Call<RegisterDeviceResponseDTO> call, Response<RegisterDeviceResponseDTO> response) {
                            if (!response.isSuccessful()) {
                                Snackbar.make(view, response.message(), Snackbar.LENGTH_LONG).show();
                                registerDeviceBtn.setEnabled(true);
                                registerDeviceBtn.setText("Update");
                                return;
                            }
                            SharedPreferenceHelper.setSharedPreferenceString(mContext, AppConstants.SHARED_PREFS_API_KEY_KEY, newKey);
                            Snackbar.make(view, "Device Registration Successful :)", Snackbar.LENGTH_LONG).show();
                            deviceId = response.body().data.get("_id").toString();
                            deviceIdTxt.setText(deviceId);
                            SharedPreferenceHelper.setSharedPreferenceString(mContext, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, deviceId);
                            registerDeviceBtn.setEnabled(true);
                            registerDeviceBtn.setText("Update");
                            SendLogDTO sendLogInput = new SendLogDTO();
                            sendLogInput.setMessage("Device registered successfully");
                            sendLogInput.setType("info");
                            Call<SendLogDTO> logApiCall = ApiManager.getApiService().sendLog(deviceId, sendLogInput);
                            logApiCall.enqueue(new Callback<SendLogDTO>() {
                                @Override
                                public void onResponse(Call<SendLogDTO> call, Response<SendLogDTO> response) {
                                }

                                @Override
                                public void onFailure(Call<SendLogDTO> call, Throwable throwable) {
                                }
                            });
                        }
                        @Override
                        public void onFailure(Call<RegisterDeviceResponseDTO> call, Throwable t) {
                            Snackbar.make(view, "An error occured :(", Snackbar.LENGTH_LONG).show();
                            registerDeviceBtn.setEnabled(true);
                            registerDeviceBtn.setText("Update");
                        }
                    });
                });
    }

    private void handleRequestPermissions(View view) {
        boolean allPermissionsGranted = Arrays.stream(AppConstants.requiredPermissions).allMatch(permission -> TextBeeUtils.isPermissionGranted(mContext, permission));
        if (allPermissionsGranted) {
            Snackbar.make(view, "Already got permissions", Snackbar.LENGTH_SHORT).show();
            return;
        }
        String[] permissionsToRequest = Arrays.stream(AppConstants.requiredPermissions).filter(permission -> !TextBeeUtils.isPermissionGranted(mContext, permission)).toArray(String[]::new);
        Snackbar.make(view, "Please Grant Required Permissions to continue", Snackbar.LENGTH_SHORT).show();
        ActivityCompat.requestPermissions(this, permissionsToRequest, PERMISSION_REQUEST_CODE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == SCAN_QR_REQUEST_CODE) {
            IntentResult intentResult = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
            if (intentResult == null || intentResult.getContents() == null) {
                Toast.makeText(getBaseContext(), "Canceled", Toast.LENGTH_SHORT).show();
                return;
            }
            String scannedQR = intentResult.getContents();
            apiKeyEditText.setText(scannedQR);
            handleRegisterDevice();
        }
    }
}