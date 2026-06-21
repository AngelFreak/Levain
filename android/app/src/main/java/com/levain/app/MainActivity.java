package com.levain.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.levain.app.plugins.BatteryOptimizationPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BatteryOptimizationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
