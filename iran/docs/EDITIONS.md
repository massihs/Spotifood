# Spotifood Iran

Ce dossier contient la version **Iran** de Spotifood. C'est une application indépendante : la version International (`../global/`) vit dans son propre dossier et peut évoluer différemment.

Les deux versions sont nées du même code. Les réglages qui les distinguaient au départ sont dans `src/config/edition.ts`. Ce fichier contient encore les deux configurations ; ce dossier utilise la sienne par défaut (`NEXT_PUBLIC_EDITION`). Vous pouvez simplifier ce fichier ou diverger librement.

## Spécificités de cette version

- Langues : **persan (par défaut)**, anglais, arabe. Pas de français.
- Devise par défaut : **IRR**, fuseau Asia/Tehran, TVA 10 % et 0 % à la création d'un restaurant.
- Paiement en ligne : **Zarinpal** (`src/server/infra/payments/zarinpal.ts`), plus espèces et terminal.
- Montants en `bigint` et saisie des chiffres persans (nécessaires pour les rials).
- Polices et ressources auto-hébergées : aucune requête vers Google ou un CDN étranger.
- Démo sans alcool.
- Déploiement Liara : `liara.json` à la racine du dossier, guide dans `DEPLOY.md`.

## À décider ou à faire

- Compte Zarinpal **par restaurant** (aujourd'hui `ZARINPAL_MERCHANT_ID` unique) et éventuellement partage de paiement pour la commission.
- Remboursements via l'API Zarinpal (aujourd'hui depuis le panel Zarinpal).
- Affichage en **tomans**.
- Menu de démo en persan.

## Points juridiques

Les deux versions doivent rester des services distincts : société, comptes bancaires et de paiement, hébergement, données. Stripe et de nombreux prestataires internationaux interdisent toute activité liée à l'Iran. À faire valider par un juriste avant le lancement.
