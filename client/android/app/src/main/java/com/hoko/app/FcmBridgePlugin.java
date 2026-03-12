package com.hoko.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "FcmBridge")
public class FcmBridgePlugin extends Plugin {
    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance()
            .getToken()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    String message = task.getException() != null
                        ? task.getException().getMessage()
                        : "Failed to get FCM token";
                    call.reject(message);
                    return;
                }

                JSObject result = new JSObject();
                result.put("token", task.getResult());
                call.resolve(result);
            });
    }
}
