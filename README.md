# Alignment

Alignment is a personal self-alignment and accountability application.

The system helps users define what they want to achieve, notice when their behavior drifts away from those intentions, and learn which interventions actually help them follow through.

## Repository structure

- `apps/mobile` - React Native / Expo mobile application
- `apps/api` - backend API
- `packages/alignment-engine` - core behavioral and drift-detection logic
- `packages/schemas` - shared validation schemas
- `packages/types` - shared TypeScript types

## Core architecture

Intentions -> Context -> Drift Detection -> Intervention -> Outcome -> Learning