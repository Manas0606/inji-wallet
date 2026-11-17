import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {VCMetadata} from '../../../shared/VCMetadata';
import {QrCodeOverlay} from '../../QrCodeOverlay';

type Props = {
  credential: any;
  meta: VCMetadata;
  face?: string | null;
  logoUrl?: string | null;
};

// Local wallet presentation of the verified VC, based on the Haiti Inji Web
// document layout. This does not fetch a template or modify the signed VC.
const asText = (raw: unknown): string => {
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
  if (Array.isArray(raw)) {
    const localized = raw.find(v => v && typeof v === 'object' &&
      ['fr', 'fra', 'fr-HT'].includes(String(v.language ?? v.locale ?? '')));
    if (localized) return asText(localized.value);
    if (raw.length === 1) return asText(raw[0]);
    return '';
  }
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    for (const lang of ['fra', 'fr', 'fr-HT', 'eng', 'en', 'value']) {
      if (value[lang] != null) return asText(value[lang]);
    }
  }
  return '';
};

const labelMap: Record<string, string> = {
  fullName: 'Nom complet',
  firstName: 'Prénom',
  middleName: 'Deuxième prénom',
  lastName: 'Nom',
  dateOfBirth: 'Date de naissance',
  gender: 'Sexe',
  placeOfBirth: 'Lieu de naissance',
  maritalStatus: 'État civil',
  nationality: 'Nationalité',
  department: 'Département',
  commune: 'Commune',
  communalSection: 'Section communale',
  locality: 'Localité',
  address: 'Adresse',
  addressLine1: 'Adresse',
  addressLine2: 'Complément d’adresse',
  telephone: 'Téléphone',
  phone: 'Téléphone',
  phone_number: 'Téléphone',
  email: 'Adresse e-mail',
  profession: 'Profession',
  educationLevel: 'Niveau d’instruction',
};

const labelOf = (key: string) =>
  labelMap[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');

const normalizedGender = (value: string) => {
  const key = value.toLowerCase();
  if (['m', 'male', 'masculin'].includes(key)) return 'Masculin';
  if (['f', 'female', 'féminin', 'feminin'].includes(key)) return 'Féminin';
  return value;
};

export const HaitiCredentialCard: React.FC<Props> = ({
  credential, meta, face,
}) => {
  const actualVc = credential?.credential && typeof credential.credential === 'object'
    ? credential.credential : credential;
  const source = actualVc?.credentialSubject;
  const subject = (Array.isArray(source) ? source[0] : source) || {};
  const entries = subject && typeof subject === 'object'
    ? Object.entries(subject) : [];

  const fullName = asText(subject.fullName) ||
    [asText(subject.firstName), asText(subject.middleName), asText(subject.lastName)]
      .filter(Boolean).join(' ');
  const identifier = meta?.mosipIndividualId || '';
  const fields: Array<{key: string; title: string; value: string}> = [];
  const taken = new Set<string>();

  const add = (key: string, title = labelOf(key), value = asText(subject[key])) => {
    if (!value || taken.has(key)) return;
    taken.add(key);
    fields.push({key, title, value: key === 'gender' ? normalizedGender(value) : value});
  };

  if (fullName) {
    fields.push({key: 'fullName', title: 'Nom complet', value: fullName});
    taken.add('fullName');
    taken.add('firstName');
    taken.add('lastName');
    taken.add('middleName');
  }
  add('dateOfBirth');
  add('gender');
  if (identifier) {
    fields.push({key: 'individualId', title: 'UIN / VID', value: identifier});
  }
  for (const key of ['placeOfBirth', 'nationality', 'department', 'commune',
    'communalSection', 'locality', 'addressLine1', 'addressLine2', 'telephone',
    'phone', 'phone_number', 'email', 'maritalStatus', 'profession']) {
    if (['phone', 'phone_number'].includes(key) && fields.some(f => f.title === 'Téléphone')) continue;
    add(key);
  }

  // Keep additional primitive claims visible, as in Inji Web's dynamic
  // $rowProperties table. Exclude identity photo, QR data and technical keys.
  const excluded = new Set([
    'id', 'uin', 'vid', 'individualid', 'mosipindividualid',
    'face', 'photo', 'picture', 'portrait', 'image',
    'claim169', 'qrcode', 'qrcodeimage', 'qrcodedata',
  ]);
  for (const [key] of entries) {
    if (taken.has(key) || excluded.has(key.toLowerCase())) continue;
    const value = asText(subject[key]);
    if (value && value.length < 400) add(key);
  }

  return (
    <View style={styles.shell} testID="haitiCredentialTemplate">
      <View style={styles.flag}>
        <View style={styles.blue} /><View style={styles.red} />
      </View>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HAÏTI / IDENTITÉ NUMÉRIQUE</Text>
        <Text style={styles.title}>Carte d’Identification Nationale</Text>
        <Text style={styles.subtitle}>OFFICE NATIONAL D’IDENTIFICATION</Text>
        <Text style={styles.issuer}>MOSIP  •  ATTESTATION NUMÉRIQUE</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.photoArea}>
          <View style={styles.photoFrame}>
            {face ? (
              <Image source={{uri: face}} style={styles.portrait} resizeMode="cover" />
            ) : (
              <Text style={styles.photoMissing}>Photo non disponible</Text>
            )}
          </View>
          <Text style={styles.photoLabel}>PHOTO D’IDENTITÉ</Text>
          <Image
            source={require('../../../assets/HaitiFlag.jpg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.info}>
          <Text style={styles.kicker}>INFORMATIONS DU TITULAIRE</Text>
          {fields.map(field => (
            <View style={styles.field} key={field.key}>
              <Text style={styles.fieldLabel}>{field.title}</Text>
              <Text style={styles.fieldValue} selectable={false}>{field.value}</Text>
            </View>
          ))}
          {fields.length === 0 && <Text style={styles.fieldLabel}>Informations non disponibles</Text>}
        </View>
      </View>
      <View style={styles.verification}>
        <Text style={styles.kicker}>CERTIFICAT NUMÉRIQUE</Text>
        <Text style={styles.qrHeading}>Code QR de partage et de vérification</Text>
        <Text style={styles.qrCopy}>
          Ce code correspond au justificatif numérique. La vérification nécessite
          une application compatible.
        </Text>
        <View style={styles.qrPanel}>
          <QrCodeOverlay
            verifiableCredential={{credential: actualVc} as any}
            meta={meta}
            showInlineQr={true}
            inlineQrSize={152}
            showUnavailableMessage={true}
          />
        </View>
        <Text style={styles.qrCaption}>CODE QR DU JUSTIFICATIF</Text>
      </View>
      <View style={styles.flag}><View style={styles.blue}/><View style={styles.red}/></View>
      <Text style={styles.footer}>MOSIP  •  DOCUMENT NUMÉRIQUE  •  HAÏTI</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce5ee',
    borderRadius: 15, overflow: 'hidden', marginHorizontal: 12, marginTop: 14, marginBottom: 12},
  flag: {flexDirection: 'row', height: 5},
  blue: {flex: 1, backgroundColor: '#1849a3'},
  red: {flex: 1, backgroundColor: '#c83248'},
  header: {backgroundColor: '#102e52', paddingHorizontal: 20, paddingVertical: 24,
    borderBottomWidth: 3, borderBottomColor: '#d7ad61'},
  eyebrow: {fontSize: 10, letterSpacing: 1.5, color: '#a8c7d7', fontWeight: '700'},
  title: {fontSize: 20, lineHeight: 26, fontWeight: '700', color: '#fff', marginTop: 8},
  subtitle: {fontSize: 10, letterSpacing: 0.8, color: '#d1e3ea', marginTop: 5},
  issuer: {fontSize: 10, color: '#c8d8e7', marginTop: 12},
  content: {backgroundColor: '#f2f6fa', padding: 14},
  photoArea: {alignItems: 'center', paddingBottom: 16},
  photoFrame: {width: 130, height: 151, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#eaf1f5', borderRadius: 9, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center'},
  portrait: {width: 124, height: 145},
  photoMissing: {fontSize: 11, color: '#698093', textAlign: 'center'},
  photoLabel: {fontSize: 10, color: '#71869a', letterSpacing: 0.8, marginTop: 8},
  logo: {width: 112, height: 69, marginTop: 8, borderRadius: 5},
  info: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3eaf0',
    borderRadius: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 3},
  kicker: {fontSize: 10, color: '#477487', letterSpacing: 1.1, fontWeight: '700', marginBottom: 10},
  field: {borderBottomWidth: 1, borderBottomColor: '#e7edf2', paddingBottom: 9, marginBottom: 10},
  fieldLabel: {fontSize: 11, color: '#5b7488', fontWeight: '600', marginBottom: 3},
  fieldValue: {fontSize: 14, color: '#163149', fontWeight: '600', lineHeight: 20},
  verification: {padding: 18, alignItems: 'center', backgroundColor: '#fff'},
  qrHeading: {fontSize: 16, fontWeight: '700', color: '#143a52', textAlign: 'center'},
  qrCopy: {fontSize: 11, lineHeight: 17, color: '#637d91', textAlign: 'center', marginVertical: 12},
  qrPanel: {alignItems: 'center', justifyContent: 'center', padding: 10,
    minHeight: 178, minWidth: 178, borderWidth: 1, borderColor: '#d9e6ec',
    borderRadius: 8, backgroundColor: '#fff'},
  qrCaption: {fontSize: 10, letterSpacing: 0.8, color: '#628092', marginTop: 9},
  footer: {fontSize: 9, color: '#8193a3', paddingVertical: 14, textAlign: 'center'},
});
