# Refacto Facture

## Étape A — fusion des sources

Sources :

- invoices (DB)
- comptaReport (analyse IA)

Fusion actuelle :

mergedFactures = [...comptaFactures, ...realFactures]

Reste à faire :

- logique statut compta
- bouton relance

---

## Étape B — déduplication

Règles :

1️⃣ même référence → invoice prioritaire

2️⃣ sinon
client + date + montant identiques

3️⃣ priorité affichage

invoice > compta