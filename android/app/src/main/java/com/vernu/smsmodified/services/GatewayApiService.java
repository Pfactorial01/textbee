package com.vernu.smsmodified.services;

import com.vernu.smsmodified.dtos.GetConfigDTO;
import com.vernu.smsmodified.dtos.SMSDTO;
import com.vernu.smsmodified.dtos.SMSForwardResponseDTO;
import com.vernu.smsmodified.dtos.RegisterDeviceInputDTO;
import com.vernu.smsmodified.dtos.RegisterDeviceResponseDTO;
import com.vernu.smsmodified.dtos.SendLogDTO;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.Header;
import retrofit2.http.PATCH;
import retrofit2.http.POST;
import retrofit2.http.Path;

public interface GatewayApiService {
    @POST("gateway/devices")
    Call<RegisterDeviceResponseDTO> registerDevice(@Header("x-api-key") String apiKey, @Body() RegisterDeviceInputDTO body);

    @PATCH("gateway/devices/{deviceId}")
    Call<RegisterDeviceResponseDTO> updateDevice(@Path("deviceId") String deviceId, @Header("x-api-key") String apiKey, @Body() RegisterDeviceInputDTO body);

    @POST("gateway/devices/{deviceId}/receive-sms")
    Call<SMSForwardResponseDTO> sendReceivedSMS(@Path("deviceId") String deviceId, @Header("x-api-key") String apiKey, @Body() SMSDTO body);

    @POST("gateway/get-config")
    Call<RegisterDeviceResponseDTO> getConfig(@Body() GetConfigDTO body);

    @POST("gateway/devices/{deviceId}/log")
    Call<SendLogDTO> sendLog(@Path("deviceId") String deviceId, @Body() SendLogDTO body);
}