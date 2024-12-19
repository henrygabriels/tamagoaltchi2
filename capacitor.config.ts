import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tamagoaltchi.app',
  appName: 'Tamagoaltchi',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: [
      'tamagoaltchi2-production.up.railway.app'
    ]
  },
  android: {
    buildOptions: {
      keystorePath: 'release-key.keystore',
      keystoreAlias: 'key0',
      keystorePassword: 'Octagkn8',
      keystoreAliasPassword: 'Octagkn8'
    }
  }
};

export default config;
