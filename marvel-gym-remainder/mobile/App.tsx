import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Use the same frontend build for native and browser workflows.
// Never silently load the old MFC production site.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
const configuredUrl = process.env.EXPO_PUBLIC_WEB_URL?.trim() || (__DEV__ && devHost ? `http://${devHost}:5173` : '');
function getWebsiteUrl() {
  try {
    const url = new URL(configuredUrl);
    if (url.username || url.password || (url.protocol !== 'https:' && !(__DEV__ && url.protocol === 'http:'))) return null;
    return url.href;
  } catch { return null; }
}
const websiteUrl = getWebsiteUrl();
function Website() {
  const ref = useRef<WebView>(null);
  const [canGoBack,setCanGoBack] = useState(false);
  const [error,setError] = useState('');
  const [instance,setInstance] = useState(0);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress',() => {
      if (!canGoBack || error) return false;
      ref.current?.goBack(); return true;
    });
    return () => listener.remove();
  },[canGoBack,error]);
  if (!websiteUrl || error) return <View style={styles.message}>
    <Text style={styles.title}>{error ? 'Unable to load Gym Pay' : 'Connect your Gym Pay website'}</Text>
    <Text style={styles.description}>{error || 'Set EXPO_PUBLIC_WEB_URL in mobile/.env to your updated website URL. For local development, run the website with --host 0.0.0.0 and use your computer’s LAN address on port 5173.'}</Text>
    {!!websiteUrl && <Pressable accessibilityRole="button" style={styles.button} onPress={() => {setError('');setInstance(i=>i+1);}}><Text style={styles.buttonText}>Try again</Text></Pressable>}
  </View>;
  return <WebView key={instance} ref={ref} source={{uri:websiteUrl}} style={styles.webview}
    javaScriptEnabled domStorageEnabled sharedCookiesEnabled startInLoadingState
    originWhitelist={['http://*','https://*','tel:*','whatsapp:*']}
    setSupportMultipleWindows={false}
    onMessage={event=>{void (async()=>{try{if(new URL(event.nativeEvent.url).origin!==new URL(websiteUrl).origin)return;const data=JSON.parse(event.nativeEvent.data);const types:Record<string,string>={pdf:'application/pdf',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};const extension=String(data.name).split('.').pop()||'';if(data.type!=='GYMPAY_EXPORT'||!/^[a-zA-Z0-9._-]{1,100}$/.test(data.name)||types[extension]!==data.mime||typeof data.base64!=='string'||data.base64.length>14_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))throw new Error('Unsupported export.');if(!FileSystem.cacheDirectory||!await Sharing.isAvailableAsync())throw new Error('Sharing is unavailable on this device.');const path=FileSystem.cacheDirectory+data.name;await FileSystem.writeAsStringAsync(path,data.base64,{encoding:FileSystem.EncodingType.Base64});await Sharing.shareAsync(path,{mimeType:data.mime,dialogTitle:'Save or share Gym Pay report'});}catch(e){Alert.alert('Export unavailable',e instanceof Error?e.message:'Please retry.');}})();}}
    onNavigationStateChange={event=>setCanGoBack(event.canGoBack)}
    onShouldStartLoadWithRequest={request=>{
      try {
        const url=new URL(request.url);
        if(url.origin===new URL(websiteUrl).origin) return true;
        if(['https:','tel:','whatsapp:','mailto:'].includes(url.protocol)) {
          void Linking.openURL(request.url).catch(()=>Alert.alert('Unable to open link','Install an app that can open this link.'));
        }
      } catch { /* Ignore malformed links. */ }
      return false;
    }}
    onError={event=>setError(event.nativeEvent.description || 'Check your network and website address.')}
    onHttpError={event=>{if(event.nativeEvent.url===websiteUrl)setError(`Website returned ${event.nativeEvent.statusCode}.`);}}
    renderLoading={()=> <View style={styles.loading}><ActivityIndicator size="large" color="#ffe600"/><Text style={styles.loadingText}>Loading Gym Pay…</Text></View>}
  />;
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_700Bold });
  return <SafeAreaProvider><SafeAreaView style={styles.container}><StatusBar style="dark"/>{fontsLoaded || fontError ? <Website/> : <View style={styles.loading}><ActivityIndicator size="large" color="#ffe600"/></View>}</SafeAreaView></SafeAreaProvider>;
}
const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:'#f5f6f8'},webview:{flex:1,backgroundColor:'#f5f6f8'},
  message:{flex:1,padding:28,justifyContent:'center',alignItems:'center',gap:18},
  title:{fontSize:24,fontFamily:'PlusJakartaSans_700Bold',textAlign:'center',color:'#17191c'},
  description:{fontSize:15,fontFamily:'PlusJakartaSans_400Regular',lineHeight:24,textAlign:'center',color:'#6b7280'},
  button:{backgroundColor:'#ffe600',paddingHorizontal:24,paddingVertical:14,borderRadius:12},
  buttonText:{color:'#111',fontSize:16,fontFamily:'PlusJakartaSans_700Bold'},
  loading:{position:'absolute',inset:0,justifyContent:'center',alignItems:'center',backgroundColor:'#f5f6f8'},
  loadingText:{color:'#6b7280',marginTop:14,fontFamily:'PlusJakartaSans_400Regular'},
});

