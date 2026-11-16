package io.mosip.residentapp;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.gson.Gson;

import java.util.Map;

import io.mosip.vciclient.VCIClient;
import io.mosip.vciclient.authorizationCodeFlow.clientMetadata.ClientMetadata;
import io.mosip.vciclient.credential.response.CredentialResponse;
import io.mosip.vciclient.token.TokenResponse;

public class InjiVciClientModule extends ReactContextBaseJavaModule {
    private VCIClient vciClient;
    private final ReactApplicationContext reactContext;

    public InjiVciClientModule(@Nullable ReactApplicationContext reactContext) {
        super(reactContext);

        this.reactContext = reactContext;
        VCIClientBridge.reactContext = this.reactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return "InjiVciClient";
    }

    @ReactMethod
    public void init(String appId) {
        Log.d("InjiVciClientModule", "Initializing InjiVciClientModule with " + appId);
        vciClient = new VCIClient(appId);
    }

    @ReactMethod
    public void sendProofFromJS(String jwt) {
        VCIClientCallbackBridge.completeProof(jwt);
    }

    @ReactMethod
    public void sendAuthCodeFromJS(String authCode) {
        Log.i("HAITI_AUTH", "native_auth_code_received");
        VCIClientCallbackBridge.completeAuthCode(authCode);
        Log.i("HAITI_AUTH", "native_auth_code_forwarded");
    }

    // Temporary Haiti pilot diagnostics. Only fixed stages, never sensitive values.
    @ReactMethod
    public void logAuthDiagnostic(String stage) {
        if (stage != null && stage.matches("[a-zA-Z0-9_]{1,64}")) {
            Log.i("HAITI_AUTH", stage);
        }
    }

    @ReactMethod
    public void sendTxCodeFromJS(String txCode) {
        VCIClientCallbackBridge.completeTxCode(txCode);
    }

    @ReactMethod
    public void sendIssuerTrustResponseFromJS(Boolean trusted) {
        VCIClientCallbackBridge.completeIssuerTrustResponse(trusted);
    }

    @ReactMethod
    public void sendTokenResponseFromJS(String tokenResponseJson) {
        Log.i("HAITI_AUTH", "native_token_response_received");
        TokenResponse tokenResponse = new Gson().fromJson(tokenResponseJson, TokenResponse.class);
        VCIClientCallbackBridge.completeTokenResponse(tokenResponse);
        Log.i("HAITI_AUTH", "native_token_response_forwarded");
    }

    @ReactMethod
    public void getIssuerMetadata(String credentialIssuer, Promise promise) {
        new Thread(() -> {
            try {
                Map<String, Object> issuerMetadata = vciClient.getIssuerMetadata(credentialIssuer);
                reactContext.runOnUiQueueThread(() -> {
                    String json = new Gson().toJson(issuerMetadata, Map.class);
                    promise.resolve(json);
                });
            } catch (Exception e) {
                reactContext.runOnUiQueueThread(() -> {
                    promise.reject("GET_ISSUER_METADATA_FAILED", e.getMessage(), e);
                });
            }
        }).start();
    }

    @ReactMethod
    public void requestCredentialByOffer(String credentialOffer,String clientMetadataJson, Promise promise) {
        new Thread(() -> {
            try {
                ClientMetadata clientMetadata= new Gson().fromJson(
                    clientMetadataJson, ClientMetadata.class);
                CredentialResponse response = VCIClientBridge.requestCredentialByOfferSync(vciClient, credentialOffer,clientMetadata);
                reactContext.runOnUiQueueThread(() -> {
                    promise.resolve(response != null ? response.toJsonString() : null);
                });
            } catch (Exception e) {
                reactContext.runOnUiQueueThread(() -> {
                    promise.reject("OFFER_FLOW_FAILED", e.getMessage(), e);
                });
            }
        }).start();
    }

    @ReactMethod
    public void requestCredentialFromTrustedIssuer(String credentialIssuer, String credentialConfigurationId, String clientMetadataJson, Promise promise) {
        new Thread(() -> {
            try {
                ClientMetadata clientMetadata= new Gson().fromJson(
                    clientMetadataJson, ClientMetadata.class);

                Log.i("HAITI_AUTH", "native_issuance_started");
                CredentialResponse response = VCIClientBridge.requestCredentialFromTrustedIssuerSync(vciClient, credentialIssuer, credentialConfigurationId,clientMetadata);
                Log.i("HAITI_AUTH", "native_issuance_completed");

                reactContext.runOnUiQueueThread(() -> {
                    promise.resolve(response != null ? response.toJsonString() : null);
                });
            } catch (Exception e) {
                Log.e("HAITI_AUTH", "native_issuance_failed_" + e.getClass().getSimpleName());
                reactContext.runOnUiQueueThread(() -> {
                    promise.reject("TRUSTED_ISSUER_FAILED", e.getMessage(), e);
                });
            }
        }).start();
    }
}
