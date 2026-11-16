import {NativeModules, NativeEventEmitter} from 'react-native';
import {__AppId} from '../GlobalVariables';
import {VerifiableCredential} from '../../machines/VerifiableCredential/VCMetaMachine/vc';

const emitter = new NativeEventEmitter(NativeModules.InjiVciClient);

// Temporary test diagnostics are emitted through Android logcat even in release builds.
export const traceHaitiAuth = (stage: string) => {
  if (/^[a-zA-Z0-9_]{1,64}$/.test(stage)) {
    NativeModules.InjiVciClient?.logAuthDiagnostic?.(stage);
  }
};

class VciClient {
  private static instance: VciClient;
  private InjiVciClient = NativeModules.InjiVciClient;

  private constructor() {
    this.InjiVciClient.init(__AppId.getValue());
  }

  static getInstance(): VciClient {
    if (!VciClient.instance) {
      VciClient.instance = new VciClient();
    }
    return VciClient.instance;
  }

  async sendProof(jwt: string) {
    this.InjiVciClient.sendProofFromJS(jwt);
  }

  async sendAuthCode(authCode: string) {
    traceHaitiAuth('js_auth_code_handoff');
    this.InjiVciClient.sendAuthCodeFromJS(authCode);
  }

  async sendTxCode(code: string) {
    this.InjiVciClient.sendTxCodeFromJS(code);
  }

  async sendIssuerConsent(consent: boolean) {
    this.InjiVciClient.sendIssuerTrustResponseFromJS(consent);
  }

  async sendTokenResponse(json: string) {
    traceHaitiAuth('js_token_response_handoff');
    this.InjiVciClient.sendTokenResponseFromJS(json);
  }

  async getIssuerMetadata(issuerUri: string): Promise<object> {
    const response = await this.InjiVciClient.getIssuerMetadata(issuerUri);
    return JSON.parse(response);
  }

  async requestCredentialByOffer(
    credentialOffer: string,
    getTxCode: (
      inputMode: string | undefined,
      description: string | undefined,
      length: number | undefined,
    ) => void,
    getProofJwt: (
      credentialIssuer: string,
      cNonce: string | null,
      proofSigningAlgosSupported: string[] | null,
    ) => void,
    navigateToAuthView: (authorizationEndpoint: string) => void,
    requestTokenResponse: (tokenRequest: object) => void,
    requestTrustIssuerConsent: (
      credentialIssuer: string,
      issuerDisplay: object[],
    ) => void,
  ): Promise<any> {

    const proofListener = emitter.addListener(
      'onRequestProof',
      ({credentialIssuer, cNonce, proofSigningAlgorithmsSupported}) => {
        traceHaitiAuth('native_proof_request_event');
        getProofJwt(credentialIssuer, cNonce, JSON.parse(proofSigningAlgorithmsSupported));
      },
    );

    const authListener = emitter.addListener(
      'onRequestAuthCode',
      ({authorizationUrl}) => {
        traceHaitiAuth('native_authorization_url_event');
        navigateToAuthView(authorizationUrl);
      },
    );

    const txCodeListener = emitter.addListener(
      'onRequestTxCode',
      ({inputMode, description, length}) => {
        getTxCode(inputMode, description, length);
      },
    );

    const tokenResponseListener = emitter.addListener(
      'onRequestTokenResponse',
      ({tokenRequest}) => {
        traceHaitiAuth('native_token_request_event');
        try {
          // The native bridge emits tokenRequest as a JSON string.
          // The issuer machine requires the parsed object to read tokenEndpoint,
          // grantType, authCode, redirectUri and the PKCE codeVerifier.
          const parsedTokenRequest =
            typeof tokenRequest === 'string'
              ? JSON.parse(tokenRequest)
              : tokenRequest;
          if (!parsedTokenRequest || typeof parsedTokenRequest !== 'object' ||
              Array.isArray(parsedTokenRequest)) {
            throw new Error('Invalid native token request payload');
          }
          traceHaitiAuth('native_token_request_parsed');
          requestTokenResponse(parsedTokenRequest);
        } catch (error) {
          traceHaitiAuth('native_token_request_parse_failed');
          console.error('Unable to parse native VCI token request', error);
        }
      },
    );

    const trustIssuerListener = emitter.addListener(
      'onCheckIssuerTrust',
      ({credentialIssuer, issuerDisplay}) => {
        requestTrustIssuerConsent(credentialIssuer, JSON.parse(issuerDisplay));
      },
    );

    let response = '';
    try {
      const clientMetadata = {
        clientId: 'wallet',
        redirectUri: 'io.mosip.residentapp.inji://oauthredirect',
      };
      response = await this.InjiVciClient.requestCredentialByOffer(
        credentialOffer,
        JSON.stringify(clientMetadata),
      );
    } catch (error) {
      console.error('Error requesting credential by offer:', error);
      throw error;
    } finally {
      proofListener.remove();
      authListener.remove();
      txCodeListener.remove();
      tokenResponseListener.remove();
      trustIssuerListener.remove();
    }

    traceHaitiAuth('credential_response_parse');
    const parsedResponse = JSON.parse(response);
    return {
      credential: {
        credential: parsedResponse.credential,
      } as VerifiableCredential,
      credentialConfigurationId:
        parsedResponse.credentialConfigurationId ?? {},
      credentialIssuer: parsedResponse.credentialIssuer ?? '',
    };
  }

  async requestCredentialFromTrustedIssuer(
    credentialIssuerUri: string,
    credentialConfigurationId: string,
    clientMetadata: object,
    getProofJwt: (
      credentialIssuer: string,
      cNonce: string | null,
      proofSigningAlgosSupported: string[] | null,
    ) => void,
    navigateToAuthView: (authorizationEndpoint: string) => void,
    requestTokenResponse: (tokenRequest: object) => void,
  ): Promise<any> {
    const proofListener = emitter.addListener(
      'onRequestProof',
      ({credentialIssuer, cNonce, proofSigningAlgorithmsSupported}) => {
        getProofJwt(credentialIssuer, cNonce, JSON.parse(proofSigningAlgorithmsSupported));
      },
    );

    const authListener = emitter.addListener(
      'onRequestAuthCode',
      ({authorizationUrl}) => {
        navigateToAuthView(authorizationUrl);
      },
    );

    const tokenResponseListener = emitter.addListener(
      'onRequestTokenResponse',
      ({tokenRequest}) => {
        try {
          // The native bridge emits tokenRequest as a JSON string.
          // The issuer machine requires the parsed object to read tokenEndpoint,
          // grantType, authCode, redirectUri and the PKCE codeVerifier.
          const parsedTokenRequest =
            typeof tokenRequest === 'string'
              ? JSON.parse(tokenRequest)
              : tokenRequest;
          if (!parsedTokenRequest || typeof parsedTokenRequest !== 'object' ||
              Array.isArray(parsedTokenRequest)) {
            throw new Error('Invalid native token request payload');
          }
          traceHaitiAuth('native_token_request_parsed');
          requestTokenResponse(parsedTokenRequest);
        } catch (error) {
          traceHaitiAuth('native_token_request_parse_failed');
          console.error('Unable to parse native VCI token request', error);
        }
      },
    );

    let response = '';
    try {
      response = await this.InjiVciClient.requestCredentialFromTrustedIssuer(
        credentialIssuerUri,
        credentialConfigurationId,
        JSON.stringify(clientMetadata),
      );
    } catch (error) {
      console.error('Error requesting credential from trusted issuer:', error);
      throw error;
    } finally {
      proofListener.remove();
      authListener.remove();
      tokenResponseListener.remove();
    }

    const parsedResponse = JSON.parse(response);
    return {
      credential: {
        credential: parsedResponse.credential,
      } as VerifiableCredential,
      credentialConfigurationId:
        parsedResponse.credentialConfigurationId ?? {},
      credentialIssuer: parsedResponse.credentialIssuer ?? '',
    };
  }
}

export default VciClient;
