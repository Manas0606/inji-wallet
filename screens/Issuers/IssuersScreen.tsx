import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, View } from 'react-native';
import { Issuer } from '../../components/openId4VCI/Issuer';
import { Error } from '../../components/ui/Error';
import { Header } from '../../components/ui/Header';
import { Button, Column, Row, Text } from '../../components/ui';
import { Theme } from '../../components/ui/styleUtils';
import { RootRouteProps } from '../../routes';
import { HomeRouteProps } from '../../routes/routeTypes';
import { useIssuerScreenController } from './IssuerScreenController';
import { Loader } from '../../components/ui/Loader';
import ScanIcon from '../../assets/scanIcon.svg';
import {
  isTranslationKeyFound,
  removeWhiteSpace,
} from '../../shared/commonUtil';
import {
  ErrorMessage,
  getDisplayObjectForCurrentLanguage,
  Protocols,
} from '../../shared/openId4VCI/Utils';
import {
  getInteractEventData,
  getStartEventData,
  sendInteractEvent,
  sendStartEvent,
} from '../../shared/telemetry/TelemetryUtils';
import { TelemetryConstants } from '../../shared/telemetry/TelemetryConstants';
import { MessageOverlay } from '../../components/MessageOverlay';
import { SearchBar } from '../../components/ui/SearchBar';
import { SvgImage } from '../../components/ui/svg';
import { Icon } from 'react-native-elements';
import { BannerNotificationContainer } from '../../components/BannerNotificationContainer';
import { CredentialTypeSelectionScreen } from './CredentialTypeSelectionScreen';
import { QrScanner } from '../../components/QrScanner';
import { IssuersModel } from '../../machines/Issuers/IssuersModel';
import { AUTH_ROUTES } from '../../routes/routesConstants';
import { TransactionCodeModal } from './TransactionCodeScreen';
import { TrustModal } from '../../components/TrustModal';
import i18next from 'i18next';
export const IssuersScreen: React.FC<
  HomeRouteProps | RootRouteProps
> = props => {
  const model = IssuersModel;
  const controller = useIssuerScreenController(props);
  const { i18n, t } = useTranslation('IssuersScreen');
  const issuers = controller.issuers;
  let [filteredSearchData, setFilteredSearchData] = useState(issuers);
  const [search, setSearch] = useState('');
  const [tapToSearch, setTapToSearch] = useState(false);
  const [clearSearchIcon, setClearSearchIcon] = useState(false);
  const showFullScreenError = controller.isError

  const isVerificationFailed = controller.verificationErrorMessage !== '';

  const translationKey = `errors.verificationFailed.${controller.verificationErrorMessage}`;

  const verificationErrorMessage = isTranslationKeyFound(translationKey, t)
    ? t(translationKey)
  : t('errors.verificationFailed.ERR_GENERIC');


  useLayoutEffect(() => {
    if (controller.loadingReason || showFullScreenError) {
      props.navigation.setOptions({
        headerShown: false,
      });
    } else {
      props.navigation.setOptions({
        headerShown: true,
        header: props => (
          <Header
            goBack={props.navigation.goBack}
            title={ controller.isQrScanning?t('download'):t('title')}
            testID="issuersScreenHeader"
          />
        ),
      });
    }

  }, [
    controller.loadingReason,
    controller.errorMessageType,
    controller.isStoring,
    controller.isQrScanning,
  ]);

  if (controller.isStoring) {
    props.navigation.goBack();
  }
  useEffect(() => {
    if (!controller.isAuthEndpointToOpen) {
      return;
    }

    // The native OID4VCI client generates the authorization URL (including PKCE
    // and optionally PAR). Never rewrite it to match the browser's Web flow.
    const authorizationURL = controller.authEndpount;
    const issuer = controller.selectedIssuer;
    const clientId = issuer?.client_id;
    const redirectUri = issuer?.redirect_uri;

    if (!authorizationURL || !clientId || !redirectUri) {
      console.warn('HAITI ESIGNET AUTH CHECK', {
        reason: 'Missing authorization URL or resolved Mimoto client metadata',
        hasAuthorizationURL: Boolean(authorizationURL),
        hasClientId: Boolean(clientId),
        hasRedirectUri: Boolean(redirectUri),
      });
      return;
    }

    try {
      const authUrl = new URL(authorizationURL);
      const hostIsHaiti = authUrl.hostname === 'esignet.haiti-pilot.mosip.net';
      const configuredClientId = authUrl.searchParams.get('client_id');
      const configuredRedirectUri = authUrl.searchParams.get('redirect_uri');
      const usesPAR = authUrl.searchParams.has('request_uri');
      console.info('HAITI ESIGNET AUTH CHECK', {
        authorizationHost: authUrl.hostname,
        authorizationPath: authUrl.pathname,
        hostIsHaiti,
        clientIdFromUrl: configuredClientId,
        clientIdFromMimoto: clientId,
        clientIdMatches: configuredClientId === null ? 'not in URL (possible PAR)' : configuredClientId === clientId,
        redirectUriFromUrl: configuredRedirectUri,
        redirectUriFromMimoto: redirectUri,
        redirectUriMatches: configuredRedirectUri === null ? 'not in URL (possible PAR)' : configuredRedirectUri === redirectUri,
        responseType: authUrl.searchParams.get('response_type'),
        scope: authUrl.searchParams.get('scope'),
        usesPAR,
        hasState: authUrl.searchParams.has('state'),
        hasNonce: authUrl.searchParams.has('nonce'),
        hasCodeChallenge: authUrl.searchParams.has('code_challenge'),
      });

      if (!hostIsHaiti) {
        console.warn('HAITI ESIGNET AUTH CHECK: Authorization host differs from the Haiti Web eSignet host. Check Certify authorization_server metadata; the wallet must not rewrite the generated URL.');
      }
    } catch {
      console.warn('HAITI ESIGNET AUTH CHECK: Native client returned an invalid authorization URL.');
      return;
    }

    (props.navigation as any).navigate(AUTH_ROUTES.AuthView, {
      authorizationURL,
      clientId,
      redirectUri,
      controller,
    });
  }, [controller.isAuthEndpointToOpen]);

  const onPressHandler = (id: string, protocol: string) => {
    sendStartEvent(
      getStartEventData(TelemetryConstants.FlowType.vcDownload, { id: id }),
    );
    sendInteractEvent(
      getInteractEventData(
        TelemetryConstants.FlowType.vcDownload,
        TelemetryConstants.InteractEventSubtype.click,
        `IssuerType: ${id}`,
      ),
    );
    protocol === Protocols.OTP
      ? controller.DOWNLOAD_ID()
      : controller.SELECTED_ISSUER(id);
  };

  const isGenericError = () => {
    return controller.errorMessageType === ErrorMessage.GENERIC;
  };

  function isBackendError(): boolean {
    return (
      controller.errorMessageType === ErrorMessage.TECHNICAL_DIFFICULTIES ||
      controller.errorMessageType ===
      ErrorMessage.CREDENTIAL_TYPE_DOWNLOAD_FAILURE ||
      controller.errorMessageType ===
      ErrorMessage.AUTHORIZATION_GRANT_TYPE_NOT_SUPPORTED ||
      controller.errorMessageType === ErrorMessage.NETWORK_REQUEST_FAILED
    );
  }

  const onFocusSearch = () => {
    setTapToSearch(true);
  };

  const clearSearchText = () => {
    filterIssuers('');
    setClearSearchIcon(false);
  };

  const goBack = () => {
    if (
      controller.errorMessageType &&
      controller.loadingReason === 'displayIssuers'
    ) {
      props.navigation.goBack();
    } else {
      controller.RESET_ERROR();
    }
  };

  const getImage = () => {
    if (isGenericError()) {
      return SvgImage.SomethingWentWrong();
    }
    if (isBackendError()) return SvgImage.ErrorOccurred();
    return SvgImage.NoInternetConnection();
  };

  const filterIssuers = (searchText: string) => {
    const filteredData = issuers.filter(item => {
      if (
        getDisplayObjectForCurrentLanguage(item.display)
          ?.name.toLowerCase()
          .includes(searchText.toLowerCase())
      ) {
        return getDisplayObjectForCurrentLanguage(item.display);
      }
    });
    setFilteredSearchData(filteredData);
    setSearch(searchText);
    if (searchText !== '') {
      setClearSearchIcon(true);
    } else {
      setClearSearchIcon(false);
    }
  };
  if (controller.isSelectingCredentialType) {
    return <CredentialTypeSelectionScreen {...props} />;
  }

  if (isVerificationFailed) {
    return (
      <Error
        testID="verificationError"
        isVisible={isVerificationFailed}
        isModal={true}
        alignActionsOnEnd
        title={t('MyVcsTab:errors.verificationFailed.title')}
        message={verificationErrorMessage}
        image={SvgImage.PermissionDenied()}
        showClose={false}
        primaryButtonText="goBack"
        primaryButtonEvent={controller.RESET_VERIFY_ERROR}
        primaryButtonTestID="goBack"
        customStyles={{ marginTop: '30%' }}
      />
    );
  }
  if (controller.isConsentRequested) {
    return issuerTrustConsentComponent();
  }
  if (controller.isTxCodeRequested) {
    return <TransactionCodeModal
      visible={controller.isTxCodeRequested}
      onDismiss={controller.CANCEL}
      onVerify={controller.TX_CODE_RECEIVED}
      inputMode= {controller.txCodeDisplayDetails.inputMode}
      description={controller.txCodeDisplayDetails.description}
      length={controller.txCodeDisplayDetails.length}
    />
  }

  if (controller.isBiometricsCancelled) {
    return (
      <MessageOverlay
        isVisible={controller.isBiometricsCancelled}
        minHeight={'auto'}
        title={t('errors.biometricsCancelled.title')}
        message={t('errors.biometricsCancelled.message')}
        onBackdropPress={controller.RESET_ERROR}>
        <Row>
          <Button
            fill
            type="clear"
            title={t('common:cancel')}
            onPress={controller.RESET_ERROR}
            margin={[0, 8, 0, 0]}
          />
          <Button
            testID="tryAgain"
            fill
            title={t('common:tryAgain')}
            onPress={controller.TRY_AGAIN}
          />
        </Row>
      </MessageOverlay>
    );
  }
  if (showFullScreenError) {
    return (
      <Error
        testID={`${controller.errorMessageType}Error`}
        isVisible={controller.errorMessageType !== ''}
        title={t(`errors.${controller.errorMessageType}.title`)}
        message={t(`errors.${controller.errorMessageType}.message`)}
        goBack={goBack}
        tryAgain={controller.TRY_AGAIN}
        image={getImage()}
        showClose
        primaryButtonTestID="tryAgain"
        primaryButtonText={
          controller.errorMessageType != ErrorMessage.TECHNICAL_DIFFICULTIES &&
            controller.errorMessageType !=
            ErrorMessage.AUTHORIZATION_GRANT_TYPE_NOT_SUPPORTED
            ? 'tryAgain'
            : undefined
        }
        primaryButtonEvent={controller.TRY_AGAIN}
        onDismiss={goBack}
      />
    );
  }

  if (controller.loadingReason) {
    return (
      <Loader
        title={t('loaders.loading')}
        subTitle={t(`loaders.subTitle.${controller.loadingReason}`)}
      />
    );
  }
 

  if (controller.isQrScanning) {
    return qrScannerComponent();
  }
  function qrScannerComponent() {
    return (
      <Column crossAlign="center">
        <QrScanner
          onQrFound={controller.QR_CODE_SCANNED}
        />
      </Column>
    );
  }
  
  function issuerTrustConsentComponent() {
    return <TrustModal isVisible={true} logo={controller.issuerLogo} name={controller.issuerName} onConfirm={controller.ON_CONSENT_GIVEN} onCancel={controller.CANCEL} />
  }

  return (
    <React.Fragment>
      <BannerNotificationContainer />
      {controller.issuers.length > 0 && (
        <Column style={Theme.IssuersScreenStyles.issuerListOuterContainer}>
          <Row
            style={
              tapToSearch
                ? Theme.SearchBarStyles.searchBarContainer
                : Theme.SearchBarStyles.idleSearchBarBottomLine
            }>
            <SearchBar
              searchIconTestID="searchIssuerIcon"
              searchBarTestID="issuerSearchBar"
              search={search}
              placeholder={t('searchByIssuersName')}
              onFocus={onFocusSearch}
              onChangeText={filterIssuers}
              onLayout={() => filterIssuers('')}
            />
            {clearSearchIcon && (
              <Pressable
                onPress={clearSearchText}
                style={Theme.SearchBarStyles.clearSearch}>
                <Icon
                  testID="clearingIssuerSearchIcon"
                  name="circle-with-cross"
                  type="entypo"
                  size={18}
                  color={Theme.Colors.DetailsLabel}
                />
              </Pressable>
            )}
          </Row>
          <Text
            testID="issuersScreenDescription"
            style={{
              ...Theme.TextStyles.regularGrey,
              ...Theme.IssuersScreenStyles.issuersSearchSubText,
            }}>
            {t('description')}
          </Text>
          {search === '' && <View style={{ height: 85 }}><Issuer defaultLogo={ScanIcon} displayDetails={{
            title: t('offerTitle'),
            locale: i18n.language,
            description: t('offerDescription'),
          }} onPress={
            controller.SCAN_CREDENTIAL_OFFER_QR_CODE
          } testID={'credentalOfferButton'} /></View>}

          <Column scroll style={Theme.IssuersScreenStyles.issuersContainer}>
            {controller.issuers.length > 0 && (
              <FlatList
                data={filteredSearchData}
                renderItem={({ item }) => (
                  <Issuer
                    testID={removeWhiteSpace(item.issuer_id)}
                    key={item.issuer_id}
                    displayDetails={getDisplayObjectForCurrentLanguage(
                      item.display,
                    )}
                    onPress={() =>
                      onPressHandler(item.issuer_id, item.protocol)
                    }
                    {...props}
                  />
                )}
                numColumns={1}
                keyExtractor={item => item.issuer_id}
              />
            )}
          </Column>
        </Column>
      )}
    </React.Fragment>
  );
};


