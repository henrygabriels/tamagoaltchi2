import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tamagoaltchi.app',
  appName: 'Tamagoaltchi',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'tamagoaltchi2-production.up.railway.app',
      'fantasy.premierleague.com'
    ]
  },
  android: {
    buildOptions: {
      keystorePath: 'android/app/release-key.keystore',
      keystoreAlias: 'key0',
      keystorePassword: 'Octagkn8',
      keystoreAliasPassword: 'Octagkn8'
    }
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
