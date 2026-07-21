import { Color, MeshPhysicalMaterial } from 'three'
import { useMemo } from 'react'
import type { MaterialVariant } from '../domain/tileGeometry'
import type { WebGLProgramParametersWithUniforms } from 'three/src/renderers/webgl/WebGLPrograms.js'

const variantProps: Record<MaterialVariant, { roughness: number; metalness: number; clearcoat: number; transmission: number }> = {
  ceramic: { roughness: 0.44, metalness: 0.06, clearcoat: 0.32, transmission: 0 },
  glass: { roughness: 0.09, metalness: 0.02, clearcoat: 0.9, transmission: 0.38 },
  stone: { roughness: 0.78, metalness: 0.03, clearcoat: 0.06, transmission: 0 },
}

const withCraftShader = (material: MeshPhysicalMaterial): void => {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWorldPosition;\nvarying vec3 vWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvWorldPosition = worldPosition.xyz;\nvWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vWorldPosition;\nvarying vec3 vWorldNormal;\nfloat grain(vec3 p){return fract(sin(dot(p, vec3(12.9898,78.233,21.731))) * 43758.5453);}`,
      )
      .replace(
        '#include <dithering_fragment>',
        `
          float rim = pow(1.0 - max(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)), 0.0), 2.0);
          float n = grain(vWorldPosition * 9.7) * 0.05;
          gl_FragColor.rgb += vec3(rim * 0.18 + n);
          #include <dithering_fragment>
        `,
      )
  }

  material.needsUpdate = true
}

export const useCraftMaterial = (
  colorHex: string,
  variant: MaterialVariant,
  ghost = false,
): MeshPhysicalMaterial => {
  return useMemo(() => {
    const props = variantProps[variant]
    const baseColor = new Color(colorHex)
    const material = new MeshPhysicalMaterial({
      color: baseColor,
      roughness: props.roughness,
      metalness: props.metalness,
      clearcoat: props.clearcoat,
      transmission: props.transmission,
      thickness: variant === 'glass' ? 0.24 : 0,
      transparent: ghost || variant === 'glass',
      opacity: ghost ? 0.65 : 1,
      emissive: ghost ? baseColor.clone().multiplyScalar(0.13) : undefined,
      emissiveIntensity: ghost ? 0.55 : 0,
    })

    withCraftShader(material)
    return material
  }, [colorHex, ghost, variant])
}

export const useRemoteSelectionMaterial = (colorHex: string): MeshPhysicalMaterial => {
  return useMemo(() => {
    const baseColor = new Color(colorHex)
    const material = new MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.2,
      emissive: baseColor.clone().multiplyScalar(0.5),
      emissiveIntensity: 0.5,
      depthWrite: false,
    })

    withCraftShader(material)
    return material
  }, [colorHex])
}
