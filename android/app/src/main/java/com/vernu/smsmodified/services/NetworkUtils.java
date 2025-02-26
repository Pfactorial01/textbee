package com.vernu.smsmodified.services;


import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

public class NetworkUtils {

    public static String getTun0IpAddress() {
        try {
            // Get all network interfaces
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface networkInterface = interfaces.nextElement();

                // Check if the interface is "tun0"
                if (networkInterface.getName().equalsIgnoreCase("tun0")) {
                    // If it's the "tun0" interface, get its IP addresses
                    Enumeration<InetAddress> addresses = networkInterface.getInetAddresses();
                    while (addresses.hasMoreElements()) {
                        InetAddress address = addresses.nextElement();

                        if (!address.isLoopbackAddress() && address instanceof java.net.Inet4Address) {
                            return address.getHostAddress(); // Return the first IPv4 address
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null; // If no IP address is found for "tun0"
    }
}


