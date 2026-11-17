import argon2 from 'react-native-argon2';
import {AnyState} from 'xstate';
import {getDeviceNameSync} from 'react-native-device-info';
import {
  GOOGLE_DRIVE_NAME,
  ICLOUD_DRIVE_NAME,
  isAndroid,
  GMAIL,
  APPLE,
  FACE_SDK_MODEL_PATH,
  FACE_SDK_MODEL_CHECKSUM,
} from './constants';
import {generateSecureRandom} from 'react-native-securerandom';
import forge from 'node-forge';
import {useEffect, useState} from 'react';
import {Dimensions, Keyboard} from 'react-native';
import {CredentialSubject} from '../machines/VerifiableCredential/VCMetaMachine/vc';

export const hashData = async (
  data: string,
  salt: string,
  config: Argon2iConfig,
): Promise<string> => {
  const result = await argon2(data, salt, config);
  return result.rawHash as string;
};

export const generateRandomString = async () => {
  const randomBytes = await generateSecureRandom(64);
  const randomString = randomBytes.reduce(
    (acc, byte) => acc + byte.toString(16).padStart(2, '0'),
    '',
  );
  return randomString;
};
export const getRandomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
export const generateBackupEncryptionKey = (
  password: string,
  salt: string,
  iterations: number,
  length: number,
) => forge.pkcs5.pbkdf2(password, salt, iterations, length);

export interface Argon2iConfig {
  iterations: number;
  memory: number;
  parallelism: number;
  hashLength: number;
  mode: string;
}

export default function testIDProps(id: string) {
  return isAndroid()
    ? {accessible: true, accessibilityLabel: id}
    : {testID: id};
}

export const removeWhiteSpace = (str: string) => {
  return str ? str.replace(/\s/g, '') : str;
};

export function logState(state: AnyState) {
  if (__DEV__) {
    const data = JSON.stringify(
      state.event,
      (key, value) => {
        if (key === 'type') return undefined;
        if (typeof value === 'string' && value.length >= 100) {
          return value.slice(0, 100) + '...';
        }
        return value;
      },
      2,
    );
    console.log(
      `[${getDeviceNameSync()}] ${state.machine?.id}: ${
        state.event.type
      } -> ${state.toStrings().pop()}\n${
        data.length > 300 ? data.slice(0, 300) + '...' : data
      }
      `,
    );
  }
}

export const getMaskedText = (id: string): string => {
  return '*'.repeat(id.length - 4) + id.slice(-4);
};

export const faceMatchConfig = () => {
  return {
    withFace: {
      encoder: {
        tfModel: {
          path: FACE_SDK_MODEL_PATH,
          inputWidth: 160,
          inputHeight: 160,
          outputLength: 512,
          modelChecksum: FACE_SDK_MODEL_CHECKSUM,
        },
      },
      matcher: {
        threshold: 1,
      },
    },
  };
};

export const getBackupFileName = () => {
  return `backup_${Date.now()}`;
};

export const BYTES_IN_MEGABYTE = 1000 * 1000;

export const bytesToMB = (bytes: number): string => {
  if (bytes <= 0) {
    return '0';
  }

  const megabytes = bytes / BYTES_IN_MEGABYTE;
  return Number(megabytes).toFixed(3);
};

export const getAccountType = () => (isAndroid() ? GMAIL : APPLE);

export const getDriveName = () =>
  isAndroid() ? GOOGLE_DRIVE_NAME : ICLOUD_DRIVE_NAME;

export function sleep(timeInMillSeconds = 1000) {
  return new Promise(resolve => setTimeout(resolve, timeInMillSeconds));
}

export const getScreenHeight = () => {
  const {height} = Dimensions.get('window');
  const isSmallScreen = height < 600;

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      event => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight + 150);
      },
    );
    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  const screenHeight = Math.floor(height - keyboardHeight);

  return {isSmallScreen, screenHeight};
};

// Look for an explicitly named MOSIP identifier in a verified credential.
// Country schemas can nest or localize the claim structure; never substitute
// credentialSubject.id (often a DID) for a UIN or VID.
export const getMosipIdentifier = (credentialSubject: CredentialSubject): string => {
  const accepted = new Set(['uin', 'vid', 'individualid', 'mosipindividualid']);
  // Reference Manas Wallet resolves explicit UIN/VID claim names recursively.
  // Haiti KYC may additionally encode the value as a localized object/array.
  // Read the value only after identifying a UIN/VID key, never a random 'id'.
  const readExplicitId = (value: unknown, depth = 0): string | undefined => {
    if (depth > 4 || value == null) return undefined;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      return text && text.length < 128 && !/^did:/i.test(text) ? text : undefined;
    }
    if (Array.isArray(value)) {
      const inFrench = value.find(item => item && typeof item === 'object' &&
        ['fra', 'fr', 'fr-HT'].includes(String(item.language ?? item.locale ?? '')));
      if (inFrench) {
        const result = readExplicitId(inFrench, depth + 1);
        if (result) return result;
      }
      for (const item of value) {
        const result = readExplicitId(item, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of ['value', 'fra', 'fr', 'fr-HT', 'eng', 'en', 'text']) {
        if (obj[key] != null) {
          const result = readExplicitId(obj[key], depth + 1);
          if (result) return result;
        }
      }
    }
    return undefined;
  };
  const find = (value: unknown, depth = 0): string | undefined => {
    if (value == null || depth > 6 || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const result = find(entry, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    const object = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(object)) {
      if (!accepted.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase())) continue;
      const result = readExplicitId(item);
      if (result) return result;
    }
    for (const item of Object.values(object)) {
      const result = find(item, depth + 1);
      if (result) return result;
    }
    return undefined;
  };
  const explicitIdentifier = find(credentialSubject);
  if (explicitIdentifier) return explicitIdentifier;

  // Some issuers serialize the UIN/VID as credentialSubject.id rather than
  // a named UIN/VID claim. Only accept the exact numeric MOSIP ID lengths
  // configured for Haiti; never treat a DID, URI, or arbitrary subject ID
  // as an identity number.
  if (credentialSubject && typeof credentialSubject === 'object' &&
      !Array.isArray(credentialSubject)) {
    const subjectId = (credentialSubject as Record<string, unknown>).id;
    if (typeof subjectId === 'string' && /^(?:[0-9]{12}|[0-9]{16})$/.test(subjectId.trim())) {
      return subjectId.trim();
    }
  }
  return '';
};

export const isTranslationKeyFound = (
  translationKey: string,
  t: (key: string) => string,
): boolean => {
  const translation = t(translationKey);
  return translation !== translationKey;
};
