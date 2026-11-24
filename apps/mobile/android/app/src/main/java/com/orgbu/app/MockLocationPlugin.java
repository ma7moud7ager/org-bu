package com.orgbu.app;

import android.Manifest;
import android.location.Location;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/** Current position with the platform's mock-location flag (the stock geolocation plugin does not expose it). */
@CapacitorPlugin(
    name = "MockLocation",
    permissions = { @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }) }
)
public class MockLocationPlugin extends Plugin {

    /** Push works only when google-services.json was present at build time (it generates google_app_id). */
    @PluginMethod
    public void pushConfigured(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject out = new JSObject();
        out.put("configured", id != 0);
        call.resolve(out);
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterPermission");
            return;
        }
        read(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) read(call);
        else call.reject("denied", "DENIED");
    }

    @SuppressWarnings("MissingPermission")
    private void read(PluginCall call) {
        FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(getContext());
        CurrentLocationRequest req = new CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(0)
            .setDurationMillis(20000)
            .build();
        client.getCurrentLocation(req, null)
            .addOnSuccessListener(location -> {
                if (location == null) { call.reject("unavailable", "UNAVAILABLE"); return; }
                JSObject out = new JSObject();
                out.put("lat", location.getLatitude());
                out.put("lng", location.getLongitude());
                out.put("accuracy", location.getAccuracy());
                out.put("isMock", isMock(location));
                call.resolve(out);
            })
            .addOnFailureListener(e -> call.reject("unavailable", "UNAVAILABLE"));
    }

    @SuppressWarnings("deprecation")
    private boolean isMock(Location location) {
        if (Build.VERSION.SDK_INT >= 31) return location.isMock();
        return location.isFromMockProvider();
    }
}
