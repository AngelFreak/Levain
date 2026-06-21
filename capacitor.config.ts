import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.levain.app',
  appName: 'Levain',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#5D3A1A',
      showSpinner: false,
      launchAutoHide: true,
      androidScaleType: 'FIT_CENTER',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_bread',
      iconColor: '#8b4513',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#fff8f0',
    },
  },
  server: {
    // Enable for live reload during development
    // url: 'http://YOUR_IP:5173',
    // cleartext: true,
  },
};

export default config;
