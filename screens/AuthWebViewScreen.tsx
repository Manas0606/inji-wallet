import React, {useEffect, useRef, useState, useCallback} from 'react';
import psl from 'psl';
import {
  View,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
  BackHandler,
  Linking,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {Ionicons} from '@expo/vector-icons';
import VciClient, {traceHaitiAuth} from '../shared/vciClient/VciClient';
import {Theme} from '../components/ui/styleUtils';
import {useTranslation} from 'react-i18next';

const AuthWebViewScreen: React.FC<any> = ({route, navigation}) => {
  const {authorizationURL, clientId, redirectUri, controller} = route.params;
  const webViewRef = useRef<WebView>(null);
  const callbackHandled = useRef(false);
  const expectedState = useRef<string | null>(null);
  try {
    expectedState.current = new URL(authorizationURL).searchParams.get('state');
  } catch {
    expectedState.current = null;
  }
  const [showWebView, setShowWebView] = useState(false);
  const {t} = useTranslation('authWebView');

  // Keep the exact authorization URL from the issuer's OAuth flow.
  // Adding parameters here may invalidate a signed or pushed authorization request.
  const hostName = new URL(authorizationURL).hostname; // example.mosip.net
  const parsed = psl.parse(hostName);
  const rootDomain = parsed.domain || hostName;
  const ALERT_TITLE = t('title', {
    wallet: 'Inji Wallet',
    domain: rootDomain || 'mosip.net',
  });
  const ALERT_MESSAGE = t('message');

  // Show the public OAuth client/redirect configuration in debug builds.
  // Never log the full authorization URL (it may include secrets or tokens).
  useEffect(() => {
    if (!__DEV__ || !authorizationURL) {
      return;
    }
    try {
      const url = new URL(authorizationURL);
      console.info('eSignet OAuth redirect configuration', {
        authorizationHost: url.host,
        clientId: url.searchParams.get('client_id') || clientId,
        redirectUri: url.searchParams.get('redirect_uri') || redirectUri,
        redirectUriMatchesIssuerConfig:
          url.searchParams.get('redirect_uri') === redirectUri,
      });
    } catch {
      console.warn('Unable to inspect OAuth authorization request');
    }
  }, [authorizationURL, clientId, redirectUri]);

  const handleBackPress = useCallback(() => {
    return true;
  }, []);

  useEffect(() => {
    if (!authorizationURL || !clientId || !redirectUri) {
      console.error('Missing required parameters for authentication');
      navigation.goBack();
      return;
    }

    navigation.setOptions({gestureEnabled: false});

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress,
    );

    Alert.alert(ALERT_TITLE, ALERT_MESSAGE, [
      {
        text: t('cancel'),
        style: 'cancel',
        onPress: () => {
          controller.CANCEL();
          navigation.goBack();
        },
      },
      {
        text: t('continue'),
        style: 'default',
        onPress: () => setShowWebView(true),
      },
    ]);

    return () => backHandler.remove();
  }, [
    authorizationURL,
    clientId,
    redirectUri,
    navigation,
    controller,
    handleBackPress,
  ]);

  const handleOAuthCallback = (url: string): boolean => {
    // Parse the URI and match scheme, host and path exactly, never by prefix.
    let incoming: URL;
    let registered: URL;
    try {
      incoming = new URL(url);
      registered = new URL(redirectUri);
    } catch {
      return true;
    }
    if (
      incoming.protocol === registered.protocol &&
      incoming.hostname === registered.hostname &&
      incoming.pathname === registered.pathname
    ) {
      traceHaitiAuth('oauth_redirect_detected');
      const returnedState = incoming.searchParams.get('state');
      if (expectedState.current && returnedState !== expectedState.current) {
        traceHaitiAuth('oauth_redirect_state_mismatch');
        return false;
      }
      if (callbackHandled.current) {
        traceHaitiAuth('oauth_redirect_duplicate_ignored');
        return false;
      }
      callbackHandled.current = true;
      try {
        const oauthError = incoming.searchParams.get('error');
        if (oauthError) {
          // Log only the error code; do not expose the OAuth authorization code or state.
          traceHaitiAuth('oauth_redirect_error');
          console.warn('eSignet OAuth error:', oauthError);
          controller.CANCEL();
          navigation.goBack();
          Alert.alert(t('errorTitle'), t('errorMessage'));
          return false;
        }
        const code =
          incoming.searchParams.get('code') ||
          incoming.searchParams.get('authorization_code');

        if (!code) {
          traceHaitiAuth('oauth_redirect_code_missing');
          Alert.alert(t('errorTitle'), t('errorMessage'));
          controller.CANCEL();
          navigation.goBack();
          return false;
        }

        traceHaitiAuth('oauth_redirect_code_present');
        VciClient.getInstance().sendAuthCode(code);
        traceHaitiAuth('oauth_redirect_handoff_called');
        navigation.goBack();
        return false;
      } catch (err: any) {
        traceHaitiAuth('oauth_redirect_parse_failed');
        console.warn('Error handling OAuth redirect callback');
        controller.CANCEL();
        navigation.goBack();
        return false;
      }
    }

    return true;
  };

  // Android can deliver a custom scheme to the Activity directly instead of
  // forwarding it to WebView navigation callbacks.
  useEffect(() => {
    const handleDeepLink = ({url}: {url: string}) => {
      if (!handleOAuthCallback(url)) {
        traceHaitiAuth('oauth_android_link_handled');
      }
    };
    const subscription = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL()
      .then(url => {
        if (url) {
          handleDeepLink({url});
        }
      })
      .catch(() => {
        traceHaitiAuth('oauth_initial_link_unavailable');
      });
    return () => subscription.remove();
  }, [authorizationURL, redirectUri]);

  const handleNavigationRequest = (request: any) =>
    handleOAuthCallback(request.url);

  const Header = () => (
    <View style={Theme.AuthWebViewScreenStyle.header}>
      <TouchableOpacity
        onPress={() => {
          controller.CANCEL();
          navigation.goBack();
        }}>
        <Ionicons name="arrow-back" size={24} color="black" />
      </TouchableOpacity>
      <Text style={Theme.AuthWebViewScreenStyle.headerText}>{t('authenticate')}</Text>
      <View style={{width: 24}} />
    </View>
  );

  return (
    <View style={{flex: 1}}>
      <Header />
      {showWebView && (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{
            uri: authorizationURL,
            headers: {'Accept-Language': 'fr-HT,fr;q=0.9'},
          }}
          onShouldStartLoadWithRequest={handleNavigationRequest}
          onNavigationStateChange={({url}) => {
            // Some Android WebView redirect types arrive through navigation state
            // rather than shouldStartLoadWithRequest. The callback is idempotent.
            if (!handleOAuthCallback(url)) {
              return;
            }
            // Never log the full OAuth URL (it can contain codes, state and tokens).
            try {
              const location = new URL(url);
              const error = location.searchParams.get('error');
              if (error) {
                console.warn('eSignet authorization rejected', {
                  origin: location.origin,
                  path: location.pathname,
                  error,
                });
              }
            } catch {
              // Ignore navigation entries that are not valid absolute URLs.
            }
          }}
          onError={() => {
            traceHaitiAuth('oauth_webview_load_error');
          }}
          onHttpError={({nativeEvent}) => {
            traceHaitiAuth('oauth_webview_http_error');
            // Capture only the HTTP status, not the potentially sensitive URL.
            console.warn('eSignet WebView HTTP error', nativeEvent.statusCode);
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={Theme.AuthWebViewScreenStyle.loader}>
              <ActivityIndicator size="large" />
            </View>
          )}
          javaScriptEnabled
          incognito
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
        />
      )}
    </View>
  );
};

export default AuthWebViewScreen;
