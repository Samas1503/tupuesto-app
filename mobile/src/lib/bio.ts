/** Login biométrico — expo-local-authentication.
 *  Flag `tp-biometric-ok` en AsyncStorage: si está y el dispositivo tiene
 *  biometría registrada, la app pide huella/Face ID al abrir en vez de PIN. */

import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'

const K_BIO = 'tp-biometric-ok'

export const bioActiva = async () => (await AsyncStorage.getItem(K_BIO)) === '1'
export const activarBio = () => AsyncStorage.setItem(K_BIO, '1')
export const desactivarBio = () => AsyncStorage.removeItem(K_BIO)

/** true si hay lector + credencial biométrica registrada en el dispositivo */
export async function hayBiometria(): Promise<boolean> {
  try {
    const [hw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
    return hw && enrolled
  } catch {
    return false
  }
}

/** etiqueta en rioplatense según el tipo detectado */
export async function tipoBiometria(): Promise<string> {
  try {
    const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync()
    if (tipos.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID'
    if (tipos.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'tu huella'
    if (tipos.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'tu iris'
    return 'tu biometría'
  } catch {
    return 'tu biometría'
  }
}

/** prompt nativo — true si el usuario se autenticó */
export async function pedirBiometria(): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Entrar a TuPuesto',
      cancelLabel: 'Usar PIN',
      disableDeviceFallback: false,
    })
    return r.success
  } catch {
    return false
  }
}
