import React, {useEffect, useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
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
  const [qrError, setQrError] = useState(false);
  const base64ImageType = 'data:image/png;base64,';
  const {RNSecureKeystoreModule} = NativeModules;

  async function getQRData(): Promise<string> {
    const {credential} = props.verifiableCredential;
    // Some MOSIP credentials already contain an issuer-provided QR in
    // credentialSubject.claim169. Prefer this over generating a different QR,
    // consistent with the Manas Wallet credential display logic.
    const credentialSubject =
      credential && typeof credential === 'object'
        ? credential.credentialSubject
        : undefined;
    const subjects = Array.isArray(credentialSubject)
      ? credentialSubject
      : [credentialSubject];
    for (const subject of subjects) {
      const claim169 = (subject as Record<string, unknown> | undefined)?.claim169;
      if (claim169 && typeof claim169 === 'object' && !Array.isArray(claim169)) {
        const issuerQr = Object.values(claim169).find(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        );
        if (issuerQr) {
          return issuerQr.trim();
        }
      }
    }

    try {
      const keyData = await RNSecureKeystoreModule.getData(props.meta.id);
      if (keyData?.[1] && typeof keyData[1] === 'string') {
        return keyData[1];
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
    return qrData;
  }

  let qrRef = useRef(null);

  function handleShareQRCodePress() {
    qrRef.current.toDataURL(dataURL => {
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
        if (qrData && qrData.length < MAX_QR_DATA_LENGTH) {
          setQrString(qrData);
          setQrError(false);
        } else {
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

  return (
    qrString != '' &&
    !qrError && (
      <React.Fragment>
        <View testID="qrCodeView" style={Theme.QrCodeStyles.QrView}>
          {props.showInlineQr !== false && (
            <Pressable
              {...testIDProps('qrCodePressable')}
              accessible={false}
              onPress={toggleQrOverlay}>
              <QRCode
                {...testIDProps('qrCode')}
                size={72}
                value={qrString}
                backgroundColor={Theme.Colors.QRCodeBackgroundColor}
                ecl={DEFAULT_ECL}
                onError={onQRError}
              />
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
    )
  );
};

interface QrCodeOverlayProps {
  verifiableCredential: VerifiableCredential;
  meta: VCMetadata;
  showInlineQr?: boolean;
  forceVisible?: boolean;
  onClose?: () => void;
}
