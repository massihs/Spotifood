# Spotifood Iran — déploiement sur Liara

Édition `iran` : persan par défaut, rial, Zarinpal, serveurs en Iran. Voir aussi [README.md](./README.md).

## 1. Créer les ressources dans le panel Liara

1. **Application** : plateforme **Docker**, nom `spotifood-iran` (ou modifiez `"app"` dans `liara.json`), au moins 1 Go de RAM.
2. **Base de données PostgreSQL** (version 16 ou plus).
3. **Disque** nommé `uploads` pour les photos (déjà monté sur `/app/.storage` par `liara.json`). Plus tard, vous pourrez passer au stockage objet de Liara (compatible S3) : voir `deploy/.env.production.example`.
4. **Domaine** : rattachez votre domaine `.ir` à l'application et activez le SSL.
5. _(Facultatif)_ **Serveur mail** pour les emails (factures, invitations).

## 2. Variables d'environnement

Dans l'application → Paramètres → Variables d'environnement, renseignez celles de [`deploy/.env.production.example`](./deploy/.env.production.example). Les variables indispensables :

- `APP_URL` : l'adresse publique exacte (`https://votre-domaine.ir`). Les QR codes et les retours de paiement l'utilisent.
- `APP_SECRET` : `openssl rand -base64 48`. **Ne jamais la changer ensuite** : elle signe les sessions et les cookies des clients.
- `DATABASE_URL` et `DATABASE_URL_DIRECT` : l'adresse de la base Liara.
- `ZARINPAL_MERCHANT_ID` : le code marchand de votre panel Zarinpal.
- `SEED_SUPERADMIN_EMAIL` et `SEED_SUPERADMIN_PASSWORD` : le compte super admin, créé au premier démarrage.

## 3. Déployer

Depuis ce dossier `iran/` (il contient `liara.json`) :

```bash
npm i -g @liara/cli
liara login
liara deploy
```

Ou depuis GitHub : onglet **Actions → « Deploy — Iran (Liara) » → Run workflow**. Ajoutez d'abord le secret `LIARA_API_TOKEN` (panel Liara → API) dans les réglages du dépôt.

À chaque démarrage, le conteneur :

1. applique les migrations de la base ;
2. crée ou met à jour les données de la plateforme (offres, modèles de catégories, super admin s'il n'existe pas) ;
3. démarre le serveur sur le port 3000.

`liara.json` construit l'image dans le datacenter **Allemagne** de Liara (`"build": {"location": "germany"}`) : Docker Hub et une partie du registre npm sont souvent inaccessibles depuis l'Iran. L'application, elle, **tourne en Iran**. Si le build en Iran fonctionne pour vous, vous pouvez retirer cette ligne.

## 4. Zarinpal

- Dans le panel Zarinpal, l'adresse du site doit correspondre au domaine de `APP_URL`.
- Adresse de retour utilisée automatiquement : `https://votre-domaine.ir/api/v1/payments/return/zarinpal`. Rien à configurer côté Zarinpal.
- Tests : `ZARINPAL_SANDBOX=true` utilise `sandbox.zarinpal.com`. Le bac à sable de Zarinpal est parfois indisponible : faites un premier vrai paiement de petit montant pour valider.
- Pour chaque restaurant : **Paramètres → Paiements → Paiement en ligne → Zarinpal**.
- Si la vérification échoue (réseau coupé au retour du client), le paiement reste « en cours » puis expire, et les commandes redeviennent à payer. Selon Zarinpal, une transaction jamais vérifiée est restituée automatiquement au client. À confirmer avec leur support pour votre contrat.

## 5. Vérifier

- `https://votre-domaine.ir/api/health` doit répondre `{"ok":true,"edition":"iran"}`.
- Connectez-vous en super admin, créez un restaurant, imprimez un QR, scannez-le avec un téléphone.

Testé avant livraison : l'image Iran a été construite et lancée en local (migrations, seed, persan en RTL, `/fr` en 404, prix en rials, aucune requête externe). Le déploiement réel sur Liara et l'appel réel à Zarinpal n'ont pas pu être faits d'ici (pas de compte).
