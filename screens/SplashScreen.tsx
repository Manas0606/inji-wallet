import {Dimensions} from 'react-native';
import {RootRouteProps} from '../routes';
import {Image} from 'react-native';
import React, {useEffect} from 'react';
import {APPLICATION_THEME} from 'react-native-dotenv';
import {Column} from '../components/ui';
import {useAppLayout} from './AppLayoutController';
import {useWelcomeScreen} from './WelcomeScreenController';

export const SplashScreen: React.FC<RootRouteProps> = props => {
  const imageResource =
    APPLICATION_THEME?.toLowerCase() === 'purple'
      ? require('../assets/images/png/purpleSplashScreen.png')
      : require('../assets/images/png/SplashScreen.png');
  const controller = useAppLayout();
  const welcomeController = useWelcomeScreen(props);
  useEffect(() => {
    setTimeout(() => {
      if (controller.isLanguagesetup) {
        // Haiti only supports French, so continue onboarding without a choice screen.
        welcomeController.SELECT();
      } else if (controller.isUnAuthorized) {
        props.navigation.navigate('Welcome');
      }
    }, 3000);
  }, [controller.isAuthorized || controller.isLanguagesetup]);
  return (
    <Column
      crossAlign="center"
      style={{
        flex: 1,
        justifyContent: 'center',
        height: Dimensions.get('screen').height,
        width: Dimensions.get('screen').width,
      }}>
      <Image
        resizeMode="stretch"
        style={{width: 400, height: 450}}
        source={imageResource}
      />
    </Column>
  );
};
