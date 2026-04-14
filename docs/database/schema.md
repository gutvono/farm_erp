# Database Schema Documentation

## Overview

This document will contain the complete database schema for Coffee Farm ERP, including all tables, relationships, and constraints.

## Tables & Relationships

Modelo de dados será documentado pelo agente DBA durante o desenvolvimento.

### Core Entities
- Users (Autenticação)
- Customers (Comercial)
- Suppliers (Compras)
- Stock Items (Estoque)

### Transaction Entities
- Sales (Comercial)
- Purchases (Compras)
- Stock Movements (Estoque)
- Financial Movements (Financeiro)

### Business Entities
- Invoices (Faturamento)
- Accounts Receivable (Financeiro)
- Accounts Payable (Financeiro)
- Payroll (Folha)
- Employees (Folha)
- Plots (PCP)
- Harvests (PCP)

### System Entities
- Notifications

## Key Patterns

- **Soft Delete:** deleted_at field on business entities
- **Audit Trail:** created_at, updated_at on all tables
- **Financial Movements:** Source of truth for saldo
- **Stock Movements:** Source of truth for quantities

---

**Status:** Pending detailed schema documentation by DBA during development.
