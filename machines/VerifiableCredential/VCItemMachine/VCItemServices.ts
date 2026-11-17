import { NativeModules } from 'react-native';
import getAllConfigurations, {
  API_URLS,
  CACHED_API,
  DownloadProps,
} from '../../../shared/api';
import Cloud from '../../../shared/CloudBackupAndRestoreUtils';
import { isIOS } from '../../../shared/constants';
import {
  fetchKeyPair,
  generateKeyPair,
} from '../../../shared/cryptoutil/cryptoUtil';
import { getMatchingCredentialIssuerMetadata, verifyCredentialData } from '../../../shared/openId4VCI/Utils';
import { CredentialDownloadResponse, request } from '../../../shared/request';
import { WalletBindingResponse } from '../VCMetaMachine/vc';
import { getVerifiableCredential } from './VCItemSelectors';
import {traceHaitiAuth} from '../../../shared/vciClient/VciClient';

const {RNSecureKeystoreModule} = NativeModules;
export const VCItemServices = model => {
  return {
    isUserSignedAlready: () => async () => {
      return await Cloud.isSignedInAlready();
    },

    loadDownloadLimitConfig: async context => {
      var resp = await getAllConfigurations();
      const maxLimit: number = resp.vcDownloadMaxRetry;
      const vcDownloadPoolInterval: number = resp.vcDownloadPoolInterval;

      const downloadProps: DownloadProps = {
        maxDownloadLimit: maxLimit,
        downloadInterval: vcDownloadPoolInterval,
      };
      return downloadProps;
    },

    checkDownloadExpiryLimit: async context => {
      if (context.downloadCounter > context.maxDownloadCount) {
        throw new Error(
          'Download limit expired for request id: ' +
            context.vcMetadata.requestId,
        );
      }
    },
    addWalletBindingId: async context => {
      traceHaitiAuth('activation_wallet_binding_started');
      if (!context.vcMetadata?.mosipIndividualId) {
        traceHaitiAuth('activation_identifier_missing');
        throw new Error('WALLET_ACTIVATION_MISSING_INDIVIDUAL_ID');
      }
      // Mimoto release-0.21.x expects individualId and publicKey as JSON strings.
      // Native keystore implementations may return a wrapped key object.
      const rawPublicKey = context.publicKey;
      const publicKey =
        typeof rawPublicKey === 'string'
          ? rawPublicKey
          : rawPublicKey && typeof rawPublicKey.publicKey === 'string'
          ? rawPublicKey.publicKey
          : rawPublicKey && typeof rawPublicKey.key === 'string'
          ? rawPublicKey.key
          : null;
      const individualId = context.vcMetadata.mosipIndividualId;
      if (typeof individualId !== 'string' && typeof individualId !== 'number') {
        traceHaitiAuth('activation_identifier_invalid_type');
        throw new Error('WALLET_ACTIVATION_INVALID_INDIVIDUAL_ID');
      }
      if (!publicKey || !publicKey.trim()) {
        traceHaitiAuth('activation_public_key_invalid_type');
        throw new Error('WALLET_ACTIVATION_INVALID_PUBLIC_KEY');
      }
      const response = await request(
        API_URLS.walletBinding.method,
        API_URLS.walletBinding.buildURL(),
        {
          requestTime: String(new Date().toISOString()),
          request: {
            authFactorType: 'WLA',
            format: 'jwt',
            individualId: String(individualId),
            transactionId: context.bindingTransactionId,
            publicKey,
            challengeList: [
              {
                authFactorType: 'OTP',
                challenge: context.OTP,
                format: 'alpha-numeric',
              },
            ],
          },
        },
      );

      traceHaitiAuth('activation_wallet_binding_success');
      const walletResponse: WalletBindingResponse = {
        walletBindingId: response.response.encryptedWalletBindingId,
        keyId: response.response.keyId,
        thumbprint: response.response.thumbprint,
        expireDateTime: response.response.expireDateTime,
      };
      return walletResponse;
    },
    fetchKeyPair: async context => {
      traceHaitiAuth('activation_keystore_read_started');
      const keyType = context.vcMetadata?.downloadKeyType;
      const result = await fetchKeyPair(keyType);
      traceHaitiAuth('activation_keystore_read_success');
      return result;
    },
    generateKeypairAndStore: async context => {
      traceHaitiAuth('activation_key_generation_started');
      const keyType = context.vcMetadata?.downloadKeyType;
      const keypair = await generateKeyPair(keyType);
      if ((keyType != 'ES256' && keyType != 'RS256') || isIOS())
        await RNSecureKeystoreModule.storeGenericKey(
          keypair.publicKey as string,
          keypair.privateKey as string,
          keyType,
        );
      traceHaitiAuth('activation_key_generation_success');
      return keypair;
    },
    requestBindingOTP: async context => {
      traceHaitiAuth('activation_otp_request_started');
      // Wallet binding authenticates the identity bound to this credential.
      // Do not submit an empty UIN/VID or substitute an unrelated VC ID.
      if (!context.vcMetadata?.mosipIndividualId) {
        traceHaitiAuth('activation_identifier_missing');
        throw new Error('WALLET_ACTIVATION_MISSING_INDIVIDUAL_ID');
      }
      const response = await request(
        API_URLS.bindingOtp.method,
        API_URLS.bindingOtp.buildURL(),
        {
          requestTime: String(new Date().toISOString()),
          request: {
            individualId: context.vcMetadata.mosipIndividualId,
            otpChannels: ['EMAIL', 'PHONE'],
          },
        },
      );
      if (response.response == null) {
        traceHaitiAuth('activation_otp_empty_response');
        throw new Error('Could not process request');
      }
      traceHaitiAuth('activation_otp_request_success');
      return response;
    },
    fetchIssuerWellknown: async context => {
      const wellknownResponse = await CACHED_API.fetchIssuerWellknownConfig(
        context.vcMetadata.issuer,
        context.vcMetadata.issuerHost,
        true,
      );
      try {
        return getMatchingCredentialIssuerMetadata(
          wellknownResponse,
          context.verifiableCredential.credentialConfigurationId,
        );
      } catch (error) {
        return {};
      }
    },
    checkStatus: context => (callback, onReceive) => {
      const pollInterval = setInterval(
        () => callback(model.events.POLL()),
        context.downloadInterval,
      );

      onReceive(async event => {
        if (event.type === 'POLL_STATUS') {
          try {
            const response = await request(
              API_URLS.credentialStatus.method,
              API_URLS.credentialStatus.buildURL(context.vcMetadata.requestId),
            );
            switch (response.response?.statusCode) {
              case 'NEW':
                break;
              case 'ISSUED':
              case 'printing':
                callback(model.events.DOWNLOAD_READY());
                break;
              case 'FAILED':
              default:
                callback(model.events.FAILED());
                clearInterval(pollInterval);
                break;
            }
          } catch (error) {
            callback(model.events.FAILED());
            clearInterval(pollInterval);
          }
        }
      });

      return () => clearInterval(pollInterval);
    },

    downloadCredential: context => (callback, onReceive) => {
      const pollInterval = setInterval(
        () => callback(model.events.POLL()),
        context.downloadInterval,
      );

      onReceive(async event => {
        if (event.type === 'POLL_DOWNLOAD') {
          const response: CredentialDownloadResponse = await request(
            API_URLS.credentialDownload.method,
            API_URLS.credentialDownload.buildURL(),
            {
              individualId: context.vcMetadata.mosipIndividualId,
              requestId: context.vcMetadata.requestId,
            },
          );

          callback(
            model.events.CREDENTIAL_DOWNLOADED({
              credential: response.credential,
              verifiableCredential: response.verifiableCredential,
              generatedOn: new Date(),
              idType: context.vcMetadata.idType,
              requestId: context.vcMetadata.requestId,
              lastVerifiedOn: null,
              walletBindingResponse: null,
              credentialRegistry: '',
            }),
          );
        }
      });

      return () => clearInterval(pollInterval);
    },

    verifyCredential: async (context: any) => {
      if(context.verifiableCredential){
        const verificationResult = await verifyCredentialData(
          getVerifiableCredential(context.verifiableCredential),
          context.selectedCredentialType.format
        );
         if(!verificationResult.isVerified) {
            throw new Error(verificationResult.verificationErrorCode);
          }
          return verificationResult;
      }
    },
  };
};
