import React, {useEffect, useRef, useState} from 'react';
import {Pressable, View, Image} from 'react-native';
import {Icon, Overlay} from 'react-native-elements';
import {Centered, Column, Row, Text, Button} from './ui';
import QRCode from 'react-native-qrcode-svg';
import {Theme} from './ui/styleUtils';
import {useTranslation} from 'react-i18next';
import testIDProps from '../shared/commonUtil';
import {SvgImage} from './ui/svg';
import {NativeModules} from 'react-native';
import {VerifiableCredential} from '../machines/VerifiableCredential/VCMetaMachine/vc';
import {DEFAULT_ECL, MAX_QR_DATA_LENGTH} from '../shared/constants';
import {VCMetadata} from '../shared/VCMetadata';
import {shareImageToAllSupportedApps} from '../shared/sharing/imageUtils';
import {ShareOptions} from 'react-native-share';
import {unwrapIssuedCredential} from '../shared/vciClient/CredentialPayload';

export const QrCodeOverlay: React.FC<QrCodeOverlayProps> = props => {
  const {RNPixelpassModule} = NativeModules;
  const {t} = useTranslation('VcDetails');
  const [qrString, setQrString] = useState('');
  const [qrImageUri, setQrImageUri] = useState('');
  const [qrError, setQrError] = useState(false);
  const [qrFailure, setQrFailure] = useState<'too-large' | 'verification' | 'native' | 'unsupported' | ''>('');
  const base64ImageType = 'data:image/png;base64,';
  const {RNSecureKeystoreModule} = NativeModules;

  // As in Manas Wallet's PixelPassAdapter: verify that a generated QR can
  // decode back to exactly the credential being presented.
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]));
    }
    return value;
  };

  const verifyPixelPass = async (value: string, credential: unknown) => {
    if (!value) throw new Error('HAITI_QR_EMPTY');
    if (value.length > MAX_QR_DATA_LENGTH) throw new Error('HAITI_QR_TOO_LARGE');
    const decodedRaw: string = await RNPixelpassModule.decode(value);
    let decoded: unknown = decodedRaw;
    if (typeof decodedRaw === 'string') {
      try { decoded = JSON.parse(decodedRaw); } catch {}
    }
    if (JSON.stringify(normalize(decoded)) !== JSON.stringify(normalize(credential))) {
      throw new Error('HAITI_QR_VERIFICATION_FAILED');
    }
    return value;
  };

  async function getQRData(): Promise<{kind: 'image' | 'payload'; value: string}> {
    // Use the same signed credential representation as the native VCI
    // response and Manas Wallet's PixelPassAdapter.
    const credential = unwrapIssuedCredential(props.verifiableCredential);
    if (!credential) throw new Error('Credential is not available for QR');

    const classifyIssuerQr = (raw: string) => {
      const value = raw.trim();
      if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) {
        return {kind: 'image' as const, value};
      }
      if (/^iVBORw0KGgo[A-Za-z0-9+/=\s]+$/.test(value)) {
        return {kind: 'image' as const, value: 'data:image/png;base64,' + value.replace(/\s/g, '')};
      }
      return {kind: 'payload' as const, value};
    };
    // Use only a QR explicitly supplied in the signed VC when one exists.
    // Image bytes must be displayed as an image, never encoded as QR text.
    const subject = typeof credential === 'object' ? credential.credentialSubject : undefined;
    const subjects = Array.isArray(subject) ? subject : [subject];
    for (const entry of subjects) {
      if (!entry || typeof entry !== 'object') continue;
      const claims = entry as Record<string, unknown>;
      for (const key of ['qrCodeImage', 'qrCodeData', 'qrCode', 'claim169']) {
        const claim = claims[key];
        if (typeof claim === 'string' && claim.trim()) {
          return classifyIssuerQr(claim);
        }
        if (claim && typeof claim === 'object' && !Array.isArray(claim)) {
          const found = Object.values(claim).find(
            (v): v is string => typeof v === 'string' && v.trim().length > 0,
          );
          if (found) return classifyIssuerQr(found);
        }
      }
    }

    if (props.meta.format && props.meta.format !== 'ldp_vc') {
      throw new Error('HAITI_QR_UNSUPPORTED_FORMAT');
    }

    try {
      const keyData = await RNSecureKeystoreModule.getData(props.meta.id);
      if (typeof keyData?.[1] === 'string') {
        try {
          return {kind: 'payload', value: await verifyPixelPass(keyData[1], credential)};
        } catch {
          // A cached QR can become stale across SDK versions. Regenerate it.
        }
      }
    } catch {
      // An unavailable keystore should not block QR generation.
    }

    const qrData = await RNPixelpassModule.generateQRData(
      JSON.stringify(credential), '',
    );
    await verifyPixelPass(qrData, credential);
    try {
      await RNSecureKeystoreModule.storeData(props.meta.id, qrData);
    } catch {
      // Secure-storage failures should not hide a validated QR.
    }
    return {kind: 'payload', value: qrData};
  }

  let qrRef = useRef(null);

  function handleShareQRCodePress() {
    if (qrImageUri) {
      shareImage(qrImageUri);
      return;
    }
    qrRef.current?.toDataURL((dataURL: string) => {
      shareImage(`${base64ImageType}${dataURL}`);
    });
  }

  async function shareImage(base64String: string) {
    const options: ShareOptions = {
      url: base64String,
    };
    const shareStatus = await shareImageToAllSupportedApps(options);
    if (!shareStatus) {
      console.error('Error while sharing QR code::');
    }
  }

  function onQRError() {
    console.warn('HAITI_QR:render_error');
    setQrFailure('native');
    setQrError(true);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const qrData = await getQRData();
        if (!active) {
          return;
        }
        if (qrData.kind === 'image') {
          setQrFailure('');
          setQrImageUri(qrData.value);
          setQrString('');
          setQrError(false);
        } else if (qrData.value && qrData.value.length <= MAX_QR_DATA_LENGTH) {
          setQrFailure('');
          setQrString(qrData.value);
          setQrImageUri('');
          setQrError(false);
        } else {
          setQrString('');
          setQrImageUri('');
          setQrFailure('too-large');
          setQrError(true);
        }
      } catch (error) {
        // Report failure category only. Never log VC data or QR payloads.
        const message = error instanceof Error ? error.message : '';
        const kind = message === 'HAITI_QR_TOO_LARGE' ? 'too-large'
          : message === 'HAITI_QR_VERIFICATION_FAILED' ? 'verification'
          : message === 'HAITI_QR_UNSUPPORTED_FORMAT' ? 'unsupported'
          : 'native';
        console.warn('HAITI_QR:' + kind);
        if (active) {
          setQrString('');
          setQrImageUri('');
          setQrFailure(kind);
          setQrError(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [props.meta.id, props.verifiableCredential]);
  const [isQrOverlayVisible, setIsQrOverlayVisible] = useState(false);

  const overlayVisible = props.forceVisible ?? isQrOverlayVisible;

  const toggleQrOverlay = () => {
    if (props.onClose) props.onClose();
    else setIsQrOverlayVisible(!overlayVisible);
  };

  if ((!qrString && !qrImageUri) || qrError) {
    return props.showUnavailableMessage ? (
      <Text style={{color: '#738798', textAlign: 'center', fontSize: 12}}>
        {qrFailure === 'too-large'
          ? 'Code QR non disponible : justificatif trop volumineux pour PixelPass.'
          : qrFailure === 'verification'
            ? 'Code QR non disponible : la vérification PixelPass a échoué.'
            : qrFailure === 'unsupported'
              ? 'Code QR non disponible pour ce format. Utilisez le partage OpenID4VP.'
              : qrFailure === 'native'
                ? 'Code QR non disponible : encodage du justificatif impossible.'
                : 'Code QR non disponible pour ce justificatif.'}
      </Text>
    ) : null;
  }

  return (
      <React.Fragment>
        <View testID="qrCodeView" style={Theme.QrCodeStyles.QrView}>
          {props.showInlineQr !== false && (
            <Pressable
              {...testIDProps('qrCodePressable')}
              accessible={false}
              onPress={toggleQrOverlay}>
              {qrImageUri ? (
                <Image
                  source={{uri: qrImageUri}}
                  style={{width: props.inlineQrSize ?? 72, height: props.inlineQrSize ?? 72}}
                  resizeMode="contain"
                />
              ) : (
                <QRCode
                  {...testIDProps('qrCode')}
                  size={props.inlineQrSize ?? 72}
                  value={qrString}
                  backgroundColor={Theme.Colors.QRCodeBackgroundColor}
                  ecl={DEFAULT_ECL}
                  onError={onQRError}
                />
              )}
              <View
                testID="magnifierZoom"
                style={[Theme.QrCodeStyles.magnifierZoom]}>
                {SvgImage.MagnifierZoom()}
              </View>
            </Pressable>
          )}
        </View>

        <Overlay
          isVisible={overlayVisible}
          onBackdropPress={toggleQrOverlay}
          overlayStyle={{padding: 1, borderRadius: 21}}>
          <Column style={Theme.QrCodeStyles.expandedQrCode}>
            <Row pY={20} style={Theme.QrCodeStyles.QrCodeHeader}>
              <Text
                testID="qrCodeHeader"
                align="center"
                style={Theme.TextStyles.header}
                weight="bold">
                {t('qrCodeHeader')}
              </Text>
              <Icon
                {...testIDProps('qrCodeCloseIcon')}
                name="close"
                onPress={toggleQrOverlay}
                color={Theme.Colors.Details}
                size={32}
              />
            </Row>
            <Centered testID="qrCodeDetails" pY={30}>
              {qrImageUri ? (
                <Image
                  source={{uri: qrImageUri}}
                  style={{width: 300, height: 300}}
                  resizeMode="contain"
                />
              ) : (
                <QRCode
                  {...testIDProps('qrCodeExpandedView')}
                  size={300}
                  value={qrString}
                  backgroundColor={Theme.Colors.QRCodeBackgroundColor}
                  ecl={DEFAULT_ECL}
                  quietZone={10}
                  onError={onQRError}
                  getRef={data => (qrRef.current = data)}
                />
              )}
              <Button
                testID="share"
                styles={Theme.QrCodeStyles.shareQrCodeButton}
                title={t('shareQRCode')}
                type="gradient"
                icon={
                  <Icon
                    name="share-variant-outline"
                    type="material-community"
                    size={24}
                    color="white"
                  />
                }
                onPress={handleShareQRCodePress}
              />
            </Centered>
          </Column>
        </Overlay>
      </React.Fragment>
  );
};

interface QrCodeOverlayProps {
  verifiableCredential: VerifiableCredential;
  meta: VCMetadata;
  showInlineQr?: boolean;
  inlineQrSize?: number;
  showUnavailableMessage?: boolean;
  forceVisible?: boolean;
  onClose?: () => void;
}
