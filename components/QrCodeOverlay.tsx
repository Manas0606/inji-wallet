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

export const QrCodeOverlay: React.FC<QrCodeOverlayProps> = props => {
  const {RNPixelpassModule} = NativeModules;
  const {t} = useTranslation('VcDetails');
  const [qrString, setQrString] = useState('');
  const [qrImageUri, setQrImageUri] = useState('');
  const [qrError, setQrError] = useState(false);
  const base64ImageType = 'data:image/png;base64,';
  const {RNSecureKeystoreModule} = NativeModules;

  async function getQRData(): Promise<{kind: 'image' | 'payload'; value: string}> {
    const wrapped = props.verifiableCredential?.credential;
    const credential = wrapped?.credential && typeof wrapped.credential === 'object'
      ? wrapped.credential : wrapped;
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

    try {
      const keyData = await RNSecureKeystoreModule.getData(props.meta.id);
      if (keyData?.[1] && typeof keyData[1] === 'string') {
        return {kind: 'payload', value: keyData[1]};
      }
    } catch {
      // QR has not been cached yet. Generate it below.
    }

    const qrData = await RNPixelpassModule.generateQRData(
      JSON.stringify(credential),
      '',
    );
    try {
      await RNSecureKeystoreModule.storeData(props.meta.id, qrData);
    } catch {
      // A cache write failure must not prevent displaying a valid QR.
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
    console.warn('Data is too big');
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
          setQrImageUri(qrData.value);
          setQrString('');
          setQrError(false);
        } else if (qrData.value && qrData.value.length <= MAX_QR_DATA_LENGTH) {
          setQrString(qrData.value);
          setQrImageUri('');
          setQrError(false);
        } else {
          setQrString('');
          setQrImageUri('');
          setQrError(true);
        }
      } catch {
        // Do not leave an unhandled rejection when a credential cannot
        // be encoded as a QR (e.g. unsupported credential format).
        if (active) {
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
        Code QR non disponible pour ce justificatif
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
