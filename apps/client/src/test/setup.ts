import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
	interface Assertion<R extends void | Promise<void> = void, T = unknown>
		extends TestingLibraryMatchers<any, T> {}
	interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}

expect.extend(matchers)

if (typeof globalThis.ResizeObserver === 'undefined') {
	class ResizeObserver {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	}

	globalThis.ResizeObserver = ResizeObserver
}
