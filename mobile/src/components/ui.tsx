/** UI kit propio — reemplaza HeroUI en la app web.
 *  View/Text/TextInput/Pressable/Modal + estilos con la paleta navy/blurple. */

import React, { type ReactNode } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch as RNSwitch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, useAccent } from '../theme'

/* ── Screen: fondo paper + scroll + padding ────────────────── */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets()
  const inner = (
    <View style={{ padding: 16, paddingBottom: 96 + insets.bottom, gap: 16 }}>{children}</View>
  )
  if (!scroll) return <View style={[st.fill, { backgroundColor: C.paper }]}>{inner}</View>
  return (
    <ScrollView
      style={[st.fill, { backgroundColor: C.paper }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 96 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 16 }}>{children}</View>
    </ScrollView>
  )
}

/* ── Tipografía ─────────────────────────────────────────────── */
export function H1({ children }: { children: ReactNode }) {
  return <Text style={st.h1}>{children}</Text>
}
export function Sub({ children, style, lines }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) {
  return <Text style={[st.sub, style]} numberOfLines={lines}>{children}</Text>
}
export function Muted({ children, style, lines }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) {
  return <Text style={[{ color: C.muted }, style]} numberOfLines={lines}>{children}</Text>
}
export function Num({ children, style, lines }: { children: ReactNode; style?: StyleProp<TextStyle>; lines?: number }) {
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]} numberOfLines={lines}>{children}</Text>
}

/* ── Card ───────────────────────────────────────────────────── */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.card, style]}>{children}</View>
}
export function CardHead({ title, desc, right }: { title: string; desc?: string; right?: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.cardTitle}>{title}</Text>
        {desc != null && <Text style={st.cardDesc}>{desc}</Text>}
      </View>
      {right}
    </View>
  )
}
export function CardBody({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }, style]}>{children}</View>
}
export function CardFoot({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 0 }}>{children}</View>
}

/* ── Chip ───────────────────────────────────────────────────── */
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'
const chipBg: Record<ChipColor, string> = {
  default: C.surfaceTertiary,
  accent: '#635bff22',
  success: '#0f6b3a1e',
  warning: '#f59e4226',
  danger: '#b8490022',
}
const chipFg: Record<ChipColor, string> = {
  default: C.muted,
  accent: C.blurple,
  success: C.success,
  warning: '#92600a',
  danger: C.danger,
}
export function Chip({ texto, color = 'default', solid = false }: { texto: string; color?: ChipColor; solid?: boolean }) {
  const accent = useAccent()
  const bg = solid ? (color === 'accent' ? accent : chipFg[color]) : chipBg[color]
  const fg = solid ? '#fff' : chipFg[color]
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{texto}</Text>
    </View>
  )
}

/* ── Botones ────────────────────────────────────────────────── */
export type BtnVariant = 'primary' | 'tertiary' | 'outline' | 'danger' | 'danger-soft' | 'ghost'
export function Btn({
  children, onPress, variant = 'primary', disabled = false, sm = false, style, flex,
}: {
  children: ReactNode
  onPress?: () => void
  variant?: BtnVariant
  disabled?: boolean
  sm?: boolean
  style?: StyleProp<ViewStyle>
  flex?: boolean
}) {
  const accent = useAccent()
  const base: ViewStyle = {
    borderRadius: 12,
    paddingHorizontal: sm ? 12 : 16,
    paddingVertical: sm ? 8 : 11,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.45 : 1,
  }
  const styles: Record<BtnVariant, { box: ViewStyle; txt: TextStyle }> = {
    primary: { box: { backgroundColor: accent }, txt: { color: '#fff', fontWeight: '800' } },
    tertiary: { box: { backgroundColor: 'transparent' }, txt: { color: accent, fontWeight: '700' } },
    outline: { box: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, txt: { color: C.navy, fontWeight: '700' } },
    danger: { box: { backgroundColor: C.danger }, txt: { color: '#fff', fontWeight: '800' } },
    'danger-soft': { box: { backgroundColor: '#b8490022' }, txt: { color: C.danger, fontWeight: '700' } },
    ghost: { box: { backgroundColor: 'transparent' }, txt: { color: C.muted, fontWeight: '600' } },
  }
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [base, styles[variant].box, flex && { flex: 1 }, pressed && { opacity: 0.75 }, style]}
    >
      <Text style={[styles[variant].txt, { fontSize: sm ? 13 : 15 }]}>{children}</Text>
    </Pressable>
  )
}

/* ── FAB "+" flotante ───────────────────────────────────────── */
export function FAB({ onPress, label = '+' }: { onPress: () => void; label?: string }) {
  const accent = useAccent()
  const insets = useSafeAreaInsets()
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Agregar"
      style={({ pressed }) => [{
        position: 'absolute', right: 16, bottom: 84 + insets.bottom,
        height: 56, width: 56, borderRadius: 28, backgroundColor: accent,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '300', marginTop: -2 }}>{label}</Text>
    </Pressable>
  )
}

/* ── Campos de texto ────────────────────────────────────────── */
export function Field({
  label, value, onChange, placeholder, secure = false, numeric = false, style,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  secure?: boolean
  numeric?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {label != null && <Text style={st.label}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={numeric ? (v => onChange(v.replace(/[^\d]/g, ''))) : onChange}
        placeholder={placeholder}
        placeholderTextColor="#42546688"
        secureTextEntry={secure}
        keyboardType={numeric ? 'number-pad' : 'default'}
        autoCapitalize="none"
        style={st.input}
      />
    </View>
  )
}

/** campo numérico con stepper +/- (NumberField de web) */
export function NumField({
  label, value, onChange, min = 0, max, step = 1, money = false, style,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  money?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const clampV = (n: number) => {
    let r = Number.isFinite(n) ? n : 0
    if (min != null) r = Math.max(min, r)
    if (max != null) r = Math.min(max, r)
    return r
  }
  return (
    <View style={[{ gap: 4 }, style]}>
      {label != null && <Text style={st.label}>{label}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Pressable onPress={() => onChange(clampV(value - step))} style={st.stepper} accessibilityLabel="Menos">
          <Text style={st.stepperTxt}>−</Text>
        </Pressable>
        <TextInput
          value={value === 0 ? '' : String(value)}
          onChangeText={v => onChange(clampV(Number(v.replace(/[^\d]/g, '')) || 0))}
          placeholder={money ? '$0' : '0'}
          placeholderTextColor="#42546666"
          keyboardType="number-pad"
          style={[st.input, { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] }]}
        />
        <Pressable onPress={() => onChange(clampV(value + step))} style={st.stepper} accessibilityLabel="Más">
          <Text style={st.stepperTxt}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

/* ── Select (modal con lista de opciones) ───────────────────── */
export interface Opcion {
  id: string
  label: string
}
export function Select({
  label, value, onChange, opciones, placeholder = 'Elegí…', disabled = false,
}: {
  label?: string
  value: string | null
  onChange: (id: string) => void
  opciones: Opcion[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const sel = opciones.find(o => o.id === value)
  return (
    <View style={{ gap: 4 }}>
      {label != null && <Text style={st.label}>{label}</Text>}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[st.input, { justifyContent: 'center', opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={{ color: sel ? C.navy : '#42546688', fontSize: 15 }}>
          {sel ? sel.label : placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
          <View style={st.pickBox}>
            <ScrollView style={{ maxHeight: 340 }}>
              {opciones.length === 0 && <Text style={{ padding: 14, color: C.muted, fontSize: 13 }}>Sin opciones</Text>}
              {opciones.map(o => (
                <Pressable
                  key={o.id}
                  onPress={() => { onChange(o.id); setOpen(false) }}
                  style={({ pressed }) => [st.pickItem, pressed && { backgroundColor: C.paper }]}
                >
                  <Text style={{ fontSize: 14, color: C.navy, fontWeight: o.id === value ? '800' : '500' }}>
                    {o.label}
                  </Text>
                  {o.id === value && <Text style={{ color: C.blurple, fontWeight: '900' }}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

/* ── Segmentos (ToggleButtonGroup) ──────────────────────────── */
export function Segments<T extends string>({
  opciones, value, onChange,
}: {
  opciones: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const accent = useAccent()
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.surfaceTertiary, borderRadius: 12, padding: 3, gap: 3 }}>
      {opciones.map(o => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={{
            flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
            backgroundColor: value === o.id ? accent : 'transparent',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: value === o.id ? '#fff' : C.muted }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/* ── Switch ─────────────────────────────────────────────────── */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  const accent = useAccent()
  return (
    <RNSwitch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: C.border, true: accent }}
      thumbColor="#fff"
      accessibilityLabel={label}
    />
  )
}

/* ── Meter (barra de progreso) ──────────────────────────────── */
export function Meter({ pct, color, track }: { pct: number; color?: string; track?: string }) {
  const accent = useAccent()
  const w = Math.max(0, Math.min(100, pct))
  return (
    <View style={{ height: 10, borderRadius: 6, backgroundColor: track ?? C.vizTrack, overflow: 'hidden', flex: 1 }}>
      <View style={{ height: '100%', width: `${w}%`, backgroundColor: color ?? accent, borderRadius: 6 }} />
    </View>
  )
}

/* ── Sheet: modal tipo bottom-sheet ─────────────────────────── */
export function Sheet({
  visible, onClose, title, children, footer,
}: {
  visible: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.backdrop} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontSize: 20, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer != null && (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/* ── Confirmación (AlertDialog) ─────────────────────────────── */
export function ConfirmSheet({
  visible, onClose, titulo, children, textoOk = 'Confirmar', onOk, peligro = false,
}: {
  visible: boolean
  onClose: () => void
  titulo: string
  children?: ReactNode
  textoOk?: string
  onOk: () => void
  peligro?: boolean
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={titulo}
      footer={
        <>
          <Btn variant="tertiary" flex onPress={onClose}>Cancelar</Btn>
          <Btn variant={peligro ? 'danger' : 'primary'} flex onPress={() => { onOk(); onClose() }}>{textoOk}</Btn>
        </>
      }
    >
      {children}
    </Sheet>
  )
}

/* ── EmptyState ─────────────────────────────────────────────── */
export function EmptyState({ titulo, descripcion, hint }: { titulo: string; descripcion?: string; hint?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18, gap: 6 }}>
      <View style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: '#635bff1c', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Text style={{ fontSize: 20 }}>📦</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '800', color: C.navy, textAlign: 'center' }}>{titulo}</Text>
      {descripcion != null && <Text style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>{descripcion}</Text>}
      {hint != null && <Text style={{ fontSize: 11, color: C.muted, opacity: 0.7, textAlign: 'center', marginTop: 2 }}>{hint}</Text>}
    </View>
  )
}

/* ── Spinner ────────────────────────────────────────────────── */
export function Loading({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
      <ActivityIndicator color={C.blurple} />
      <Muted style={{ fontSize: 13 }}>{texto}</Muted>
    </View>
  )
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  h1: { fontSize: 24, fontWeight: '800', color: C.navy, letterSpacing: -0.4 },
  sub: { fontSize: 14, color: C.muted },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.navy },
  cardDesc: { fontSize: 12, color: C.muted, marginTop: 2 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 15,
    color: C.navy,
  },
  stepper: {
    width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
  },
  stepperTxt: { fontSize: 16, fontWeight: '800', color: C.muted },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,37,64,0.35)', justifyContent: 'center', padding: 20,
  },
  pickBox: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border, maxHeight: 360,
  },
  pickItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: C.border,
  },
})
