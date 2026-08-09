import { Html } from '@react-three/drei'
import type { WitnessSignal } from '../domain/witnessSignals'

export const WITNESS_MARK_DETAIL = 'Witness mark. Observed by Fantome, the resident. This prototype signal did not change this mosaic.'

type ResidentWitnessLayerProps = {
  signals: readonly WitnessSignal[]
  onDetail?: (signal: WitnessSignal) => void
}

const visuallyHiddenStyle = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden' as const,
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap' as const,
  border: 0,
}

export const ResidentWitnessLayer = ({ signals, onDetail }: ResidentWitnessLayerProps) => (
  <group data-witness-layer="fantome">
    {signals.map((signal) => {
      const detailId = `witness-detail-${signal.id}`

      return (
        <group
          key={signal.id}
          data-witness-signal={signal.id}
          position={[signal.anchor.x + 0.46, signal.anchor.y + 0.42, 0.34]}
        >
          <mesh rotation={[0, 0, Math.PI / 6]}>
            <ringGeometry args={[0.16, 0.2, 24, 1, 0, Math.PI * 1.35]} />
            <meshBasicMaterial color="#9ba69a" transparent opacity={0.58} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <circleGeometry args={[0.035, 12]} />
            <meshBasicMaterial color="#b7c1af" transparent opacity={0.72} depthWrite={false} />
          </mesh>
          <Html position={[0, 0, 0.02]} center transform={false}>
            <button
              type="button"
              aria-label={`Fantome resident witness mark. ${signal.label}`}
              aria-describedby={detailId}
              onClick={() => onDetail?.(signal)}
              style={visuallyHiddenStyle}
            >
              Fantome resident witness mark
            </button>
            <span id={detailId} style={visuallyHiddenStyle}>
              {WITNESS_MARK_DETAIL}
            </span>
          </Html>
        </group>
      )
    })}
  </group>
)