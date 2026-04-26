"use client";

/**
 * Gleiche Implementierung wie das Konzern-`BrandingBootstrap` im Root-Layout:
 * `BrandingBootstrapCore` (siehe `@/components/branding/BrandingBootstrapCore`).
 * Nicht erneut einbinden — sonst doppelter Fetch. Worker nutzt das globale Bootstrap.
 */
export { BrandingBootstrapCore as WorkerBrandingBootstrap } from "@/components/branding/BrandingBootstrapCore";
