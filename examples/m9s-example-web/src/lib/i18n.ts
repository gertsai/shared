// SPDX-License-Identifier: Apache-2.0
/**
 * Wave 10.A — paraglide-js runtime barrel.
 *
 * Messages and runtime are compile-time codegen'd by the paraglide() Vite
 * plugin into ./src/paraglide (gitignored). The `$paraglide` alias is wired
 * in svelte.config.js → kit.alias.
 *
 * Consumers:
 *   import { m } from '$lib/i18n';
 *   m.nav_link_home();
 *
 * Locale switching:
 *   import { setLanguageTag } from '$lib/i18n';
 *   setLanguageTag('ru');
 */
import * as m from '$paraglide/messages';

export { m };
export { setLanguageTag, sourceLanguageTag, availableLanguageTags, languageTag } from '$paraglide/runtime';
export type AvailableLanguageTag = 'en' | 'ru';
