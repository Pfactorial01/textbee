package com.vernu.smsmodified.services;
import android.os.Build;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class MachineCodeGenerator {
    public static String generateMachineKey() {
        try {
            // Combine unique device identifiers
            String deviceInfo = Build.MANUFACTURER +
                    Build.MODEL +
                    Build.SERIAL +
                    Build.ID +
                    Build.FINGERPRINT;

            // Create SHA-256 hash
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(deviceInfo.getBytes());

            // Convert to hex string
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }

            // Add the "mkey:" prefix
            return "mkey:" + hexString.toString();

        } catch (NoSuchAlgorithmException e) {
            e.printStackTrace();
            return null;
        }
    }
}
