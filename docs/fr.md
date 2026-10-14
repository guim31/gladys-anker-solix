# Anker SOLIX

Suivez dans Gladys vos batteries solaires **Anker SOLIX Solarbank** (E1600,
Solarbank 2, Solarbank 3), le **Smart Meter** et les **Smart Plug** d'Anker,
et les micro-onduleurs **MI80** rattachés à un système : niveau de batterie,
charge et décharge, production solaire, puissance envoyée à la maison,
soutirage et injection réseau. Avec l'option « Autoriser les réglages », Gladys
peut aussi changer le **mode d'utilisation** et la **puissance de sortie**
d'une Solarbank 2 ou 3.

L'intégration passe par le cloud Anker, comme l'appli Anker : elle ne
communique pas directement avec les appareils.

> **Développée sans le matériel** : elle s'appuie sur des réponses réelles du
> cloud publiées par la bibliothèque
> [anker-solix-api](https://github.com/thomluther/anker-solix-api). Vos retours
> sont les bienvenus. Intégration indépendante, sans lien avec Anker
> Innovations.

## Présentation

- Un appareil Gladys par **Solarbank**, **micro-onduleur**, **compteur** et
  **prise** de chaque système Anker, plus un appareil **« Anker SOLIX
  <système> »** pour ce qui concerne tout le système (mode d'utilisation,
  consommation de la maison, production solaire).
- Les valeurs sont relues toutes les minutes (réglable), et seules les
  valeurs qui changent sont envoyées à Gladys.
- La production solaire totale est un **index** (kWh) : le suivi d'énergie de
  Gladys 5.2 en tire la production par demi-heure.
- Un widget de tableau de bord montre le flux d'énergie : soleil → batterie →
  maison / réseau, et le niveau de batterie.

## Prérequis

- Gladys **5.2.0** ou plus récent.
- Un système configuré dans l'**appli Anker** (« Power System ») : le cloud
  ne publie aucune valeur pour un appareil qui n'est dans aucun système.
- Le compte Anker (e-mail, mot de passe, pays choisi à la création du
  compte).

**Compte conseillé : un second compte.** Pendant longtemps, le cloud Anker
n'acceptait qu'une session par compte : la connexion de Gladys déconnectait
l'appli du téléphone. Depuis l'appli 3.10 (juillet 2025), un compte peut être
utilisé en parallèle, mais le plus sûr reste de créer un second compte Anker
(une autre adresse e-mail) et de lui **partager votre système** depuis l'appli
(partage du système aux membres de la famille). Un compte partagé (« membre ») voit toutes les
valeurs, mais **ne peut pas changer les réglages** : pour piloter le mode et
la puissance depuis Gladys, il faut le compte propriétaire.

## Configuration

1. Installez l'intégration depuis **Intégrations → Installer depuis GitHub**
   (ou depuis le store une fois publiée).
2. Dans l'onglet **Configuration**, saisissez :
   - **E-mail** et **Mot de passe** du compte Anker ;
   - **Pays du compte** : le code à deux lettres choisi à la création du
     compte (`FR`, `BE`, `CH`, `DE`, `ES`, `US`…). Il choisit le serveur Anker
     (Europe ou reste du monde) ; un mauvais pays donne une connexion réussie
     mais aucun système ;
   - **Langue des noms** : la langue des noms de fonctionnalités et des
     messages (français par défaut) ;
   - **Intervalle de rafraîchissement** : 1, 2 ou 5 minutes. Le cloud Anker ne
     rafraîchit pas plus vite (toutes les 5 minutes pour beaucoup de
     Solarbank 2) ;
   - **Autoriser les réglages** : décoché par défaut, Gladys ne fait alors que
     lire.
3. Enregistrez, puis **Tester la connexion** : le message indique le nombre de
   systèmes et d'appareils trouvés.
4. Ajoutez les appareils depuis l'onglet **Découverte**.

Le jeton de session est gardé dans `/data` (jamais le mot de passe) pour ne
pas se reconnecter à chaque redémarrage.

## Appareils

**Anker SOLIX <système>** (un par système Anker) :

| Fonctionnalité             | Détail                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode d'utilisation         | Solarbank 2 et 3 : compteur intelligent, prises connectées, planning manuel, mode IA (Solarbank 3), et en lecture seule charge de secours, plages tarifaires, tarif dynamique |
| Consommation de la maison  | W, avec un compteur dans le système                                                                                                                                           |
| Production solaire totale  | kWh, index depuis la mise en service                                                                                                                                          |
| Production solaire du jour | kWh, relue toutes les 5 minutes                                                                                                                                               |

**Solarbank** (E1600, Solarbank 2 Pro / Plus / AC, Solarbank 3) :

| Fonctionnalité                    | Détail                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| Niveau de batterie                | %                                                               |
| Énergie stockée                   | kWh, d'après la capacité du modèle et des batteries d'extension |
| Puissance de charge / de décharge | W, toujours positives                                           |
| Puissance solaire                 | W, toutes entrées                                               |
| Entrée solaire 1 à 4              | W, par entrée quand le cloud la donne (Solarbank 2 et 3)        |
| Puissance vers la maison          | W, sortie de la Solarbank                                       |

**Micro-onduleur** (MI80 dans un système) : puissance solaire (W).

**Compteur** (Anker Smart Meter, Shelly 3EM / Pro 3EM) : soutirage réseau et
injection réseau (W).

**Prise** (Anker Smart Plug) : puissance consommée (W).

Le **mode d'utilisation** s'affiche en boutons dans le tableau de bord. Un
appui n'agit que si « Autoriser les réglages » est coché (sinon Gladys affiche
pourquoi et remet le mode réel).

## Widget

Le widget **Anker SOLIX** (réglage : le système, facultatif) montre :

- le **niveau de batterie** en jauge ;
- **Solaire**, **Charge / Décharge**, **Vers la maison** et **Soutirage /
  Injection** (avec un compteur) : le flux d'énergie se lit de gauche à
  droite ;
- le mode d'utilisation, la consigne de sortie, l'énergie stockée, la
  production du jour et les appareils hors ligne ;
- avec « Autoriser les réglages » et le compte propriétaire, deux boutons qui
  ouvrent un formulaire : **Puissance** (en planning manuel) et **Mode**.

## Déclencheurs et actions de scène

Déclencheurs :

- **Mode d'utilisation changé** : le mode a changé hors de Gladys (appli
  Anker, charge de secours, mode IA). Filtres : système, nouveau mode.
  Variables : nouveau mode (clé et libellé), mode précédent. Un changement
  fait par Gladys ne le déclenche pas.
- **Appareil hors ligne ou revenu** : une Solarbank, un compteur ou une prise
  ne remonte plus au cloud Anker (deux lectures de suite), ou remonte de
  nouveau. Filtres : appareil, état. Variables : nom, état.

« Batterie pleine » et « batterie sous un seuil » ne sont pas des
déclencheurs de l'intégration : le déclencheur de Gladys **« Changement d'état
de l'appareil »** sur le **Niveau de batterie**, avec « Exécuter seulement lorsque le seuil est passé », le fait déjà.

Actions (cocher « Autoriser les réglages », compte propriétaire, Solarbank 2
ou 3) :

- **Régler la puissance de sortie** : change la puissance de la plage en cours
  du planning manuel (arrondie au pas de 10 W, bornée par le système).
  Sortie : puissance appliquée. Le mode doit être « Planning manuel ».
- **Changer le mode d'utilisation** : compteur intelligent, prises
  connectées, planning manuel ou mode IA. Sortie : mode appliqué.

Rien d'autre n'est jamais écrit (ni firmware, ni réserve de batterie, ni
limites).

## Exemples de scènes

- **Lancer le lave-linge sur le surplus** : déclencheur « Changement d'état de
  l'appareil » sur _Injection réseau_ au-dessus de 500 W pendant 10 minutes →
  allumer la prise du lave-linge.
- **Batterie pleine** : déclencheur « Changement d'état de l'appareil » sur
  _Niveau de batterie_ ≥ 100, seuil passé → notification « Batterie pleine,
  profitez du soleil ».
- **Soirée** : à 18 h → action « Régler la puissance de sortie » à 300 W ; à
  23 h → 100 W (planning manuel).
- **Alerte** : « Appareil hors ligne ou revenu », état _hors ligne_ →
  notification avec `{{triggerEvent.data.device_name}}`.

## Dépannage

- **« Le cloud Anker a refusé l'e-mail ou le mot de passe »** : vérifiez-les
  dans l'appli Anker. Gladys ne réessaie pas tant que la configuration n'est
  pas enregistrée de nouveau, pour ne pas faire bloquer le compte.
- **Code de vérification demandé** : connectez-vous une fois au compte dans
  l'appli Anker, puis enregistrez la configuration.
- **Connecté, mais aucun système** : mauvais pays du compte, ou système non
  partagé avec ce compte.
- **Valeurs figées** : le cloud ne met parfois à jour une Solarbank 2 que
  toutes les 5 minutes ; vérifiez que l'appli Anker montre des valeurs
  récentes.
- **Réglage refusé** : « Autoriser les réglages » décoché, compte membre,
  Solarbank 1, ou mode autre que « Planning manuel » pour la puissance.
- Journaux détaillés : variable `LOG_LEVEL=debug` du conteneur. Les journaux
  ne contiennent jamais l'e-mail, le mot de passe ni le jeton.

## Limites

- **Développée sans le matériel** : testée sur des réponses réelles du cloud
  publiées par anker-solix-api, pas sur une installation. Retours bienvenus.
- Cloud uniquement : sans Internet ou si Anker change son API, plus de
  valeurs. Les valeurs ont jusqu'à 1 à 5 minutes de retard.
- Quotas : une lecture par système et par intervalle, la production du jour
  toutes les 5 minutes, au plus une requête toutes les 0,5 s ; le cloud
  limite chaque point d'accès à une dizaine de requêtes par minute.
- Réglages limités aux Solarbank 2 et 3 (mode, puissance de la plage en
  cours) ; la Solarbank 1 est en lecture seule.
- Stations portables (Solix C/F), Power Panel et X1 : le cloud ne donne pas
  leurs valeurs par cette API (elles passent par MQTT), ils ne sont pas pris
  en charge. Solarbank 4 et Solarbank Max : lues si le cloud les liste dans le
  système, sans réglage ni test.
- Les prises sont lues, pas commandées.
