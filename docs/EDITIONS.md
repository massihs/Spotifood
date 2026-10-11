# Éditions : Spotifood International et Spotifood Iran

Un seul code source, **deux éditions**, **deux déploiements indépendants** (chacun avec sa base de données, ses fichiers et ses comptes de paiement).

```
Spotifood/
├── src/config/edition.ts   ← ce qui change d'une édition à l'autre (une seule source)
├── Dockerfile              ← une recette d'image, paramétrée par l'édition
└── deploy/
    ├── iran/               ← Spotifood Iran sur Liara
    │   ├── liara.json
    │   ├── .env.example
    │   └── README.md
    └── global/             ← Spotifood International (n'importe quel hébergeur Docker)
        ├── docker-compose.yml
        ├── .env.example
        └── README.md
```

## Pourquoi pas deux copies du code

Deux dossiers contenant chacun tout le code paraissent plus simples, mais chaque correctif (sécurité, bug de paiement, nouvelle fonctionnalité) devrait alors être fait deux fois. Les deux versions finiraient par diverger. Ici, seuls les **réglages** diffèrent. Le code est commun et testé une fois, et chaque édition se déploie séparément.

Si un jour une édition doit vraiment évoluer différemment (par exemple une fonctionnalité réservée à l'Iran), on ajoute une option dans `src/config/edition.ts` : on ne duplique pas le code.

## Différences entre les éditions

|                          | International (`global`)    | Iran (`iran`)                                         |
| ------------------------ | --------------------------- | ----------------------------------------------------- |
| Langues                  | fr (par défaut), en, fa, ar | **fa (par défaut)**, en, ar                           |
| Devise par défaut        | EUR (+ USD, GBP, MAD…)      | **IRR (rial)**                                        |
| Fuseau / pays par défaut | Europe/Paris, FR            | Asia/Tehran, IR                                       |
| TVA à la création        | 10 %, 20 %, 5,5 %           | 10 % (مالیات بر ارزش افزوده), 0 %                     |
| Paiement en ligne        | Stripe                      | **Zarinpal**                                          |
| Espèces / terminal       | oui                         | oui                                                   |
| Hébergement              | au choix (Docker)           | **Liara** (serveurs en Iran)                          |
| Démo (seed)              | menu complet                | menu sans alcool                                      |
| Prix des offres SaaS     | 29 € / 79 € par mois        | 990 000 / 2 490 000 tomans par mois (**à confirmer**) |

L'édition est fixée **au moment du build** (`NEXT_PUBLIC_EDITION=global|iran`), car elle change la structure des URL (langues) et la langue par défaut. Une image Iran ne peut donc pas servir l'international par erreur.

## Ce qui a été rendu compatible avec l'Iran (et profite aussi à l'international)

- **Polices auto-hébergées** (Inter + Vazirmatn) : plus aucune requête vers Google Fonts, ni au build, ni dans le navigateur. Google est souvent inaccessible depuis l'Iran, et c'est aussi mieux pour le RGPD.
- **Aucune ressource externe** dans les pages (vérifié : 0 requête hors du site sur le menu client).
- **Montants en 64 bits** : en rials, un repas pour une tablée dépasse vite la limite des entiers 32 bits (≈ 21 millions de rials). Toutes les colonnes de montant sont en `bigint` (migration `0001_money_bigint`), et la TVA reste exacte même pour de très gros montants.
- **Saisie des chiffres persans** (۱۲۰۰۰۰) et des séparateurs persans dans les champs de prix.
- **Zarinpal** : demande de paiement, redirection, puis vérification serveur au retour (`verify`). L'URL de retour seule n'est jamais crue : l'« authority » doit correspondre et Zarinpal confirme le paiement côté serveur.

## Développement local

```bash
# International (par défaut)
npm run dev

# Iran : base séparée conseillée
NEXT_PUBLIC_EDITION=iran DATABASE_URL=postgres://…/spotifood_iran npm run dev
```

Les tests tournent en édition internationale ; `tests/integration/zarinpal.test.ts` simule l'édition Iran (IRR, persan, Zarinpal, gros montants).

## Points à décider ou à valider

- **Comptes marchands par restaurant** : comme Stripe Connect à l'international, chaque restaurant iranien devrait encaisser sur son propre compte Zarinpal. Pour l'instant, tout passe par `ZARINPAL_MERCHANT_ID` (le compte de la plateforme). Il reste à ajouter un identifiant marchand par restaurant, et éventuellement le partage de paiement (« تسهیم ») pour la commission.
- **Remboursements Zarinpal** : ils se font depuis le panel Zarinpal. L'API de remboursement de Zarinpal (séparée, avec jeton d'accès) n'est pas encore branchée, donc le bouton « Rembourser » renvoie une erreur explicite pour ces paiements.
- **Affichage en tomans** : les montants sont stockés et affichés en rials (norme ISO). Beaucoup de clients iraniens raisonnent en tomans. Un affichage en tomans est une évolution simple à prévoir.
- **Données de démo** : les noms des plats sont en français. Pour une démo commerciale en Iran, il faudra un menu en persan.
- **Juridique** : les deux éditions doivent rester des services distincts (sociétés, comptes bancaires et de paiement, hébergement), car Stripe et de nombreux prestataires internationaux interdisent toute activité liée à l'Iran. Faites valider ce montage par un juriste avant le lancement.
