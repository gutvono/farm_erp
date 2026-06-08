-- =============================================================================
-- Coffee Farm ERP - Seed de dados iniciais (idempotente)
-- =============================================================================
-- UUIDs fixos organizados por módulo (primeiro byte identifica o domínio):
--   11...  users (auth)
--   22...  clients (comercial)
--   33...  suppliers (compras)
--   44...  employees (folha)
--   55...  stock_items (estoque)
--   66...  plots (pcp)
--   77...  production_orders / production_inputs (pcp)
--   88...  purchase_orders / purchase_order_items (compras)
--   99...  sales / sale_items (comercial)
--   aa...  invoices / invoice_items (faturamento)
--   bb...  accounts_receivable (financeiro)
--   cc...  accounts_payable (financeiro)
--   dd...  payroll_periods / payroll_entries (folha)
--   de...  payroll_events (folha)
--   ee...  plot_activities (pcp)
--   ff...  stock_movements (estoque)
--   a0...  financial_movements (financeiro)
--   ab...  notifications
--   b0...  quotations (compras)
--   b1...  quotation_items (compras)
--   b2...  quotation_proposals (compras)
--   b3...  quotation_proposal_items (compras)
--   b4...  supplier_items (compras — catálogo fornecedor↔item)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USERS
-- Senha padrão para admin: admin123
-- Hash gerado com bcrypt (rounds=12)
-- -----------------------------------------------------------------------------
INSERT INTO users (id, username, hashed_password, is_active) VALUES
('11111111-1111-1111-1111-111111111001', 'admin', '$2b$12$Qu/tWbeyYlYlaj/zppVJiu86YgptYIPbe1RRvUnxOlkG3i.DCxxFq', TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. CLIENTS (3 — 1 inadimplente)
-- -----------------------------------------------------------------------------
INSERT INTO clients (id, name, document, email, phone, address, is_delinquent, notes) VALUES
('22222222-2222-2222-2222-222222222001', 'Cafeteria Grão Fino Ltda',       '12.345.678/0001-90', 'contato@graofino.com.br',      '(11) 3000-1001', 'Av. Paulista, 1000 - São Paulo/SP',  FALSE, 'Cliente premium, compra café especial'),
('22222222-2222-2222-2222-222222222002', 'Distribuidora Aroma do Cerrado', '98.765.432/0001-21', 'compras@aromacerrado.com.br',  '(62) 3500-2002', 'Rua das Palmeiras, 500 - Goiânia/GO', FALSE, 'Distribuidora regional'),
('22222222-2222-2222-2222-222222222003', 'Mercearia Dona Rita',            '456.789.123-44',     'donarita@email.com',           '(35) 99800-3003', 'Rua do Centro, 77 - Alfenas/MG',      TRUE,  'Inadimplente desde conta 03/2026')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. SUPPLIERS (3)
-- -----------------------------------------------------------------------------
-- address (legado, texto livre) mantido; os campos estruturados (cep..state)
-- são a fonte da verdade do endereço a partir da Demanda 6.
INSERT INTO suppliers (id, name, document, email, phone, address, cep, street, number, complement, neighborhood, city, state, notes) VALUES
('33333333-3333-3333-3333-333333333001', 'AgroInsumos do Brasil S.A.',      '55.444.333/0001-00', 'vendas@agroinsumos.com.br',  '(31) 3200-4001', 'Rod. Fernão Dias, KM 500 - Betim/MG',  '32600-000', 'Rodovia Fernão Dias',  'KM 500', 'Galpão 3', 'Distrito Industrial', 'Betim',      'MG', 'Fertilizantes, adubos e pesticidas'),
('33333333-3333-3333-3333-333333333002', 'Fazenda São Pedro Café Verde',    '66.555.444/0001-00', 'comercial@fazendasp.com.br', '(35) 3700-4002', 'Zona Rural - Patrocínio/MG',           '38740-000', 'Rodovia BR-365',       'S/N',    'Fazenda São Pedro', 'Zona Rural',        'Patrocínio', 'MG', 'Café verde para beneficiamento'),
('33333333-3333-3333-3333-333333333003', 'Máquinas Serra Verde Ltda',       '77.666.555/0001-00', 'pecas@serraverde.com.br',    '(35) 3900-4003', 'Av. dos Tratores, 200 - Varginha/MG',  '37026-400', 'Avenida dos Tratores', '200',    'Loja A',    'Industrial JK',      'Varginha',   'MG', 'Máquinas agrícolas e peças')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. JOB POSITIONS (cargos) — entidade referenciada por employees.position_id
--    base_salary = sugestão de salário do cargo (prefilla o do funcionário).
--    Um cargo por funcionário do seed; "Colhedor" e "Colhedora" são distintos.
--
--    IDEMPOTÊNCIA / re-seed: este INSERT usa ids fixos (referenciados por
--    employees.position_id abaixo), então o ON CONFLICT é por (id). Isso NÃO
--    protege contra a constraint UNIQUE(name) (ix_job_positions_name) caso
--    existam linhas com os MESMOS nomes e ids DIFERENTES — exatamente o que a
--    migration 0013_job_positions cria em prod a partir do role legado. A
--    proteção contra essa colisão por NOME é feita LIMPANDO job_positions antes
--    do seed (TABLES_TO_CLEAR em scripts/seed_only.py, após employees; reset_db.py
--    parte de banco vazio). Não trocar o conflito para (name): isso pularia os
--    ids fixos e quebraria a FK employees.position_id.
-- -----------------------------------------------------------------------------
INSERT INTO job_positions (id, name, description, base_salary, is_active) VALUES
('99999999-9999-9999-9999-999999990001', 'Gerente Agrícola',         'Gestão das operações agrícolas da fazenda',          6000.00, TRUE),
('99999999-9999-9999-9999-999999990002', 'Supervisora de Produção',  'Supervisão das equipes de produção',                 3500.00, TRUE),
('99999999-9999-9999-9999-999999990003', 'Operador de Máquinas',     'Operação de máquinas e implementos agrícolas',       2200.00, TRUE),
('99999999-9999-9999-9999-999999990004', 'Consultora de Qualidade',  'Análise e controle de qualidade do café',            5500.00, TRUE),
('99999999-9999-9999-9999-999999990005', 'Mecânico Industrial',      'Manutenção de máquinas e equipamentos',              4000.00, TRUE),
('99999999-9999-9999-9999-999999990006', 'Contabilidade',            'Rotinas contábeis e fiscais',                        4500.00, TRUE),
('99999999-9999-9999-9999-999999990007', 'Colhedor',                 'Colheita de café (safra)',                           1800.00, TRUE),
('99999999-9999-9999-9999-999999990008', 'Colhedora',                'Colheita de café (safra)',                           1800.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4b. EMPLOYEES (8: 3 CLT + 3 PJ + 2 Temp) — cargo via position_id (role legado: NULL)
-- -----------------------------------------------------------------------------
INSERT INTO employees (id, name, document, email, phone, position_id, contract_type, base_salary, hire_date, is_active) VALUES
('44444444-4444-4444-4444-444444444001', 'João Silva',        '111.222.333-01', 'joao.silva@fazenda.com',     '(35) 98100-0001', '99999999-9999-9999-9999-999999990001', 'clt',         6000.00, '2020-03-01', TRUE),
('44444444-4444-4444-4444-444444444002', 'Maria Santos',      '111.222.333-02', 'maria.santos@fazenda.com',   '(35) 98100-0002', '99999999-9999-9999-9999-999999990002', 'clt',         3500.00, '2021-06-15', TRUE),
('44444444-4444-4444-4444-444444444003', 'Carlos Oliveira',   '111.222.333-03', 'carlos.oliveira@fazenda.com','(35) 98100-0003', '99999999-9999-9999-9999-999999990003', 'clt',         2200.00, '2022-09-10', TRUE),
('44444444-4444-4444-4444-444444444004', 'Ana Pereira',       '111.222.333-04', 'ana.pereira@consult.com',    '(11) 98100-0004', '99999999-9999-9999-9999-999999990004', 'pj',          5500.00, '2023-02-01', TRUE),
('44444444-4444-4444-4444-444444444005', 'Pedro Costa',       '111.222.333-05', 'pedro.costa@pj.com',         '(35) 98100-0005', '99999999-9999-9999-9999-999999990005', 'pj',          4000.00, '2023-08-15', TRUE),
('44444444-4444-4444-4444-444444444006', 'Lucas Rodrigues',   '111.222.333-06', 'lucas@contabil.com',         '(35) 98100-0006', '99999999-9999-9999-9999-999999990006', 'pj',          4500.00, '2022-01-10', TRUE),
('44444444-4444-4444-4444-444444444007', 'Rafael Almeida',    '111.222.333-07', 'rafael.almeida@fazenda.com', '(35) 98100-0007', '99999999-9999-9999-9999-999999990007', 'temporario',  1800.00, '2026-02-01', TRUE),
('44444444-4444-4444-4444-444444444008', 'Sofia Lima',        '111.222.333-08', 'sofia.lima@fazenda.com',     '(35) 98100-0008', '99999999-9999-9999-9999-999999990008', 'temporario',  1800.00, '2026-02-01', TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. PAYROLL EVENTS (catalogo de eventos padrao da folha)
-- -----------------------------------------------------------------------------
INSERT INTO payroll_events (
  id, description, event_type, calculation_type, is_automatic, affects_net, is_active
) VALUES
('dededede-dede-dede-dede-dededede0001', 'Salario base',      'provento',    'manual',            FALSE, TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0002', 'Hora extra',        'provento',    'overtime',          TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0003', 'Adicional noturno', 'provento',    'night_shift',       TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0004', 'INSS',              'desconto',    'inss',              TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0005', 'Vale transporte',   'desconto',    'transport_voucher', TRUE,  TRUE,  TRUE),
('dededede-dede-dede-dede-dededede0006', 'FGTS',              'informativo', 'fgts',              TRUE,  FALSE, TRUE),
('dededede-dede-dede-dede-dededede0007', 'Descontos manuais', 'desconto',    'manual',            FALSE, TRUE,  TRUE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5b. STOCK CATEGORIES (categorias configuráveis — D2) + papéis de sistema (D3)
--     Ids fixos espelham a migration 0015 (referenciados por stock_items.category_id).
-- -----------------------------------------------------------------------------
INSERT INTO stock_categories (id, name, description, is_active) VALUES
('66666666-6666-6666-6666-666666660001', 'Café',        'Café em sacas (produto final/vendável)', TRUE),
('66666666-6666-6666-6666-666666660002', 'Insumo',      'Fertilizantes, defensivos e correções',  TRUE),
('66666666-6666-6666-6666-666666660003', 'Veículo',     'Veículos e tratores',                    TRUE),
('66666666-6666-6666-6666-666666660004', 'Equipamento', 'Máquinas e equipamentos',                TRUE),
('66666666-6666-6666-6666-666666660005', 'Outro',       'Itens diversos / refugo',                TRUE),
('66666666-6666-6666-6666-666666660006', 'Embalagem',   'Sacarias e embalagens de café',          TRUE)
ON CONFLICT (id) DO NOTHING;

-- Papéis de sistema por categoria (M:N). Café tem DOIS papéis. "Outro" recebe
-- produto_descartado (demo) para hospedar o item-destino de Descarte da colheita.
INSERT INTO category_role_assignments (id, category_id, role) VALUES
('77777777-7777-7777-7777-777777770001', '66666666-6666-6666-6666-666666660001', 'produto_final'),
('77777777-7777-7777-7777-777777770002', '66666666-6666-6666-6666-666666660001', 'produto_vendavel'),
('77777777-7777-7777-7777-777777770003', '66666666-6666-6666-6666-666666660002', 'insumo'),
('77777777-7777-7777-7777-777777770004', '66666666-6666-6666-6666-666666660003', 'veiculo'),
('77777777-7777-7777-7777-777777770005', '66666666-6666-6666-6666-666666660004', 'maquina'),
('77777777-7777-7777-7777-777777770006', '66666666-6666-6666-6666-666666660005', 'produto_descartado'),
('77777777-7777-7777-7777-777777770007', '66666666-6666-6666-6666-666666660006', 'embalagem')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. STOCK ITEMS (3 cafés + 4 insumos + 2 equipamentos + 1 descarte + 1 embalagem = 11)
-- quantity_on_hand reflete o estado pós produção/compra já representado no seed.
-- Categoria via category_id (enum `category` legado fica NULL).
-- -----------------------------------------------------------------------------
INSERT INTO stock_items (id, sku, name, category_id, unit, minimum_stock, unit_cost, quantity_on_hand, description) VALUES
-- Cafés (sacas de 60kg) → categoria Café
('55555555-5555-5555-5555-555555555001', 'CAFE-ESP', 'Café Arábica Especial (saca 60kg)',   '66666666-6666-6666-6666-666666660001', 'saca',    10.000, 900.00,   9.000,   'Café especial, pontuação SCA 85+'),
('55555555-5555-5555-5555-555555555002', 'CAFE-SUP', 'Café Arábica Superior (saca 60kg)',   '66666666-6666-6666-6666-666666660001', 'saca',    20.000, 650.00,  17.000,   'Café superior, SCA 80-84'),
('55555555-5555-5555-5555-555555555003', 'CAFE-TRA', 'Café Arábica Tradicional (saca 60kg)','66666666-6666-6666-6666-666666660001', 'saca',    20.000, 450.00,  -1.000,   'Café tradicional, SCA <80'),
-- Insumos → categoria Insumo
('55555555-5555-5555-5555-555555555011', 'INS-FERT', 'Fertilizante NPK 20-05-20',           '66666666-6666-6666-6666-666666660002', 'kg',     100.000,  12.00, 500.000,   'Fertilizante granulado para cafeeiro'),
('55555555-5555-5555-5555-555555555012', 'INS-ADUB', 'Adubo Orgânico',                      '66666666-6666-6666-6666-666666660002', 'kg',     100.000,   8.00, 200.000,   'Adubo composto orgânico'),
('55555555-5555-5555-5555-555555555013', 'INS-PEST', 'Pesticida Fungicida',                 '66666666-6666-6666-6666-666666660002', 'litro',   20.000,  25.00,  15.000,   'Fungicida de contato - abaixo do mínimo'),
('55555555-5555-5555-5555-555555555014', 'INS-CALC', 'Calcário Dolomítico',                 '66666666-6666-6666-6666-666666660002', 'kg',     200.000,   3.00, 300.000,   'Correção de acidez do solo'),
-- Veículo / Equipamento
('55555555-5555-5555-5555-555555555021', 'EQP-TRA01', 'Trator New Holland T6',              '66666666-6666-6666-6666-666666660003', 'unidade',  1.000, 185000.00, 1.000,  'Trator 140cv com implementos'),
('55555555-5555-5555-5555-555555555022', 'EQP-COL01', 'Colheitadeira Jacto Máster',         '66666666-6666-6666-6666-666666660004', 'unidade',  1.000, 250000.00, 1.000,  'Colheitadeira automotriz para café'),
-- Item-destino de Descarte da colheita (categoria Outro → produto_descartado)
('55555555-5555-5555-5555-555555555031', 'CAFE-DESC', 'Café Descarte (refugo)',             '66666666-6666-6666-6666-666666660005', 'saca',     0.000,   0.00,   0.000,   'Café descartado (refugo da colheita)'),
-- Embalagem (sacaria) → categoria Embalagem (papel `embalagem`), consumo por OP
('55555555-5555-5555-5555-555555555041', 'EMB-SC60', 'Saca de Polipropileno 60kg',          '66666666-6666-6666-6666-666666660006', 'unidade', 50.000,    5.00, 1000.000,  'Sacaria para ensaque do café (embalagem)')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6b. APP SETTINGS (key-value de configuração) — itens-destino da colheita (D1)
-- -----------------------------------------------------------------------------
INSERT INTO app_settings (id, key, value) VALUES
('88888888-8888-8888-8888-888888880001', 'harvest_destination_industria_item_id', '55555555-5555-5555-5555-555555555002'),
('88888888-8888-8888-8888-888888880002', 'harvest_destination_embalagem_item_id', '55555555-5555-5555-5555-555555555001'),
('88888888-8888-8888-8888-888888880003', 'harvest_destination_descarte_item_id',  '55555555-5555-5555-5555-555555555031')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6c. SUPPLIER ITEMS (catálogo fornecedor ↔ item de estoque, com preço)
-- Sem quantidade (estoque do fornecedor = infinito). Preços coerentes com o
-- unit_cost dos itens. NUNCA itens de descarte/refugo (não são vendáveis).
-- COBERTURA CRÍTICA: todo item de ordem de compra de PRODUTO do seed precisa
-- estar no catálogo do fornecedor daquela ordem (senão o Backend invalidaria a
-- ordem). As ordens de produto do seed são do fornecedor 33...3001 (AgroInsumos)
-- e usam os itens INS-FERT (5011), INS-ADUB (5012) e INS-PEST (5013) — todos
-- presentes abaixo no catálogo da AgroInsumos.
-- -----------------------------------------------------------------------------
INSERT INTO supplier_items (id, supplier_id, stock_item_id, unit_price, is_active) VALUES
-- AgroInsumos do Brasil S.A. (insumos) — cobre todas as ordens de produto do seed
('b4000000-0000-0000-0000-b40000000001', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555011',     11.50, TRUE),  -- Fertilizante NPK
('b4000000-0000-0000-0000-b40000000002', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555012',      7.80, TRUE),  -- Adubo Orgânico
('b4000000-0000-0000-0000-b40000000003', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555013',     24.00, TRUE),  -- Pesticida Fungicida
('b4000000-0000-0000-0000-b40000000004', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555014',      3.20, TRUE),  -- Calcário Dolomítico
('b4000000-0000-0000-0000-b40000000005', '33333333-3333-3333-3333-333333333001', '55555555-5555-5555-5555-555555555041',      4.80, TRUE),  -- Saca de Polipropileno 60kg
-- Fazenda São Pedro Café Verde (cafés verdes para beneficiamento)
('b4000000-0000-0000-0000-b40000000011', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555001',    880.00, TRUE),  -- Café Especial
('b4000000-0000-0000-0000-b40000000012', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555002',    640.00, TRUE),  -- Café Superior
('b4000000-0000-0000-0000-b40000000013', '33333333-3333-3333-3333-333333333002', '55555555-5555-5555-5555-555555555003',    440.00, TRUE),  -- Café Tradicional
-- Máquinas Serra Verde Ltda (máquinas/equipamentos)
('b4000000-0000-0000-0000-b40000000021', '33333333-3333-3333-3333-333333333003', '55555555-5555-5555-5555-555555555021', 182000.00, TRUE),  -- Trator New Holland T6
('b4000000-0000-0000-0000-b40000000022', '33333333-3333-3333-3333-333333333003', '55555555-5555-5555-5555-555555555022', 248000.00, TRUE)   -- Colheitadeira Jacto Máster
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. PLOTS (2)
-- -----------------------------------------------------------------------------
INSERT INTO plots (id, name, location, variety, capacity_sacas, total_hectares, notes) VALUES
('66666666-6666-6666-6666-666666666001', 'Talhão A - Bourbon Amarelo',  'Setor Norte, 12 ha', 'Arábica Bourbon Amarelo', 100.000, 12.00, 'Maior altitude, café especial'),
('66666666-6666-6666-6666-666666666002', 'Talhão B - Catuaí Vermelho',  'Setor Sul, 18 ha',   'Arábica Catuaí Vermelho', 150.000, 18.00, 'Produção tradicional alta')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. PURCHASE ORDER (1 concluída)
-- Ordem 88...8801: 500kg fertilizante + 200kg adubo = R$ 7.600
-- -----------------------------------------------------------------------------
INSERT INTO purchase_orders (id, supplier_id, status, total_amount, ordered_at, received_at, notes, order_type) VALUES
('88888888-8888-8888-8888-888888888001', '33333333-3333-3333-3333-333333333001', 'concluida', 7600.00, '2026-02-01 09:00:00-03', '2026-02-05 14:00:00-03', 'Reabastecimento de fertilizante e adubo', 'produto')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_order_items (id, purchase_order_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('88888888-8888-8888-8888-888888888011', '88888888-8888-8888-8888-888888888001', '55555555-5555-5555-5555-555555555011', 'Fertilizante NPK 500kg', 500.000, 12.00, 6000.00),
('88888888-8888-8888-8888-888888888012', '88888888-8888-8888-8888-888888888001', '55555555-5555-5555-5555-555555555012', 'Adubo Orgânico 200kg',   200.000,  8.00, 1600.00)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. PRODUCTION ORDER (1 concluída) - Talhão A, safra 2026/1
-- Usa 10 ha dos 12 ha do talhão A. Total 100 sacas por destino:
--   19 indústria + 52 embalagem + 29 descarte, custo R$ 8.500
-- (mapeamento herdado da qualidade antiga: especial→indústria, superior→embalagem,
--  tradicional→descarte). Os itens-destino são definidos em app_settings (D1).
-- -----------------------------------------------------------------------------
INSERT INTO production_orders (id, plot_id, order_number, start_date, expected_end_date, executed_at, hectares_used, total_sacas, industria_sacas, embalagem_sacas, descarte_sacas, total_cost, status, notes) VALUES
('77777777-7777-7777-7777-777777777001', '66666666-6666-6666-6666-666666666001', 'OP-0001', '2025-11-01', '2026-01-20', '2026-01-15 08:00:00-03', 10.00, 100.000, 19.000, 52.000, 29.000, 8500.00, 'concluida', 'Safra 2026/1 - talhão A')
ON CONFLICT (id) DO NOTHING;

INSERT INTO production_inputs (id, production_order_id, stock_item_id, quantity, unit_cost, subtotal) VALUES
('77777777-7777-7777-7777-777777777011', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555011', 400.000, 12.00, 4800.00),
('77777777-7777-7777-7777-777777777012', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555012', 150.000,  8.00, 1200.00),
('77777777-7777-7777-7777-777777777013', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555013', 100.000, 25.00, 2500.00)
ON CONFLICT (id) DO NOTHING;

-- Requisitos de mão de obra por CARGO (substitui a alocação nominal de funcionários):
-- 1 Supervisora de Produção (CLT) + 2 Operadores de Máquinas (CLT) + 5 Colhedores (temporário).
INSERT INTO production_order_position_requirements (id, production_order_id, position_id, quantity, contract_type) VALUES
('77777777-7777-7777-7777-777777777021', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990002', 1, 'clt'),
('77777777-7777-7777-7777-777777777022', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990003', 2, 'clt'),
('77777777-7777-7777-7777-777777777023', '77777777-7777-7777-7777-777777777001', '99999999-9999-9999-9999-999999990007', 5, 'temporario')
ON CONFLICT (id) DO NOTHING;

-- Recursos de estoque da OP: 1 colheitadeira (papel `maquina`, reservada) com 8h
-- de uso acumuladas → custo = horas × stock_item.hourly_cost (regra no Backend).
INSERT INTO production_order_resources (id, production_order_id, stock_item_id, resource_role, quantity, accumulated_hours) VALUES
('77777777-7777-7777-7777-777777777041', '77777777-7777-7777-7777-777777777001', '55555555-5555-5555-5555-555555555022', 'maquina', NULL, 8.00)
ON CONFLICT (id) DO NOTHING;

-- Serviço externo contratado (colheita mecanizada terceirizada).
-- accounts_payable_id = NULL: ordem já concluída, dado apenas para teste visual.
INSERT INTO production_order_services (id, production_order_id, supplier_id, description, amount, due_date, accounts_payable_id) VALUES
('77777777-7777-7777-7777-777777777031', '77777777-7777-7777-7777-777777777001', '33333333-3333-3333-3333-333333333003', 'Colheita mecanizada terceirizada - talhão A', 3500.00, '2026-01-20', NULL)
ON CONFLICT (id) DO NOTHING;

-- Atividades no talhão
INSERT INTO plot_activities (id, plot_id, activity_type, activity_date, labor_type, cost, details) VALUES
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0001', '66666666-6666-6666-6666-666666666001', 'adubacao', '2025-11-10', 'interna', 0.00,    'Adubação de cobertura, mão de obra própria'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0002', '66666666-6666-6666-6666-666666666001', 'colheita', '2026-01-10', 'externa', 3500.00, 'Colheita manual com equipe terceirizada'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeee0003', '66666666-6666-6666-6666-666666666002', 'plantio',  '2025-09-20', 'interna', 0.00,    'Plantio de mudas Catuaí Vermelho')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. SALES (2)
-- Venda 1: Cliente 1, 10 especial + 20 superior = R$ 22.000 (entregue)
-- Venda 2: Cliente 2, 15 superior + 30 tradicional = R$ 23.250 (realizada)
-- -----------------------------------------------------------------------------
INSERT INTO sales (id, client_id, status, total_amount, sold_at, delivered_at, notes) VALUES
('99999999-9999-9999-9999-999999999001', '22222222-2222-2222-2222-222222222001', 'entregue',  22000.00, '2026-02-20 10:00:00-03', '2026-02-22 15:00:00-03', 'Venda entregue e paga'),
('99999999-9999-9999-9999-999999999002', '22222222-2222-2222-2222-222222222002', 'realizada', 23250.00, '2026-03-15 11:30:00-03', NULL,                      'Venda em aberto, aguardando pagamento')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sale_items (id, sale_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('99999999-9999-9999-9999-999999999011', '99999999-9999-9999-9999-999999999001', '55555555-5555-5555-5555-555555555001', 'Café Especial - 10 sacas',    10.000, 1000.00, 10000.00),
('99999999-9999-9999-9999-999999999012', '99999999-9999-9999-9999-999999999001', '55555555-5555-5555-5555-555555555002', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
('99999999-9999-9999-9999-999999999021', '99999999-9999-9999-9999-999999999002', '55555555-5555-5555-5555-555555555002', 'Café Superior - 15 sacas',    15.000,  650.00,  9750.00),
('99999999-9999-9999-9999-999999999022', '99999999-9999-9999-9999-999999999002', '55555555-5555-5555-5555-555555555003', 'Café Tradicional - 30 sacas', 30.000,  450.00, 13500.00)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. INVOICES (2) - uma por venda
-- -----------------------------------------------------------------------------
INSERT INTO invoices (id, number, client_id, sale_id, issue_date, due_date, total_amount, status, notes) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'NF-0001', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999001', '2026-02-20', '2026-02-25', 22000.00, 'paga',    'Fatura paga em 2026-02-25'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'NF-0002', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999002', '2026-03-15', '2026-04-15', 23250.00, 'emitida', 'Aguardando recebimento')
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, subtotal) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Café Especial - 10 sacas',    10.000, 1000.00, 10000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Café Superior - 20 sacas',    20.000,  600.00, 12000.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Café Superior - 15 sacas',    15.000,  650.00,  9750.00),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0022', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Café Tradicional - 30 sacas', 30.000,  450.00, 13500.00)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 12. ACCOUNTS PAYABLE (2)
-- AP-0001: Purchase 1 paga. AP-0002: Energia elétrica em aberto.
-- -----------------------------------------------------------------------------
INSERT INTO accounts_payable (id, number, supplier_id, purchase_order_id, description, amount, due_date, paid_at, status, notes) VALUES
('cccccccc-cccc-cccc-cccc-cccccccc0001', 'AP-0001', '33333333-3333-3333-3333-333333333001', '88888888-8888-8888-8888-888888888001', 'Pagto compra fertilizante e adubo',  7600.00, '2026-02-10', '2026-02-10 11:00:00-03', 'paga',      NULL),
('cccccccc-cccc-cccc-cccc-cccccccc0002', 'AP-0002', '33333333-3333-3333-3333-333333333003', NULL,                                     'Peças de reposição máquinas',        3200.00, '2026-04-20', NULL,                       'em_aberto', 'A pagar até 20/04/2026')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 13. ACCOUNTS RECEIVABLE (3)
-- AR-0001: Venda 1 quitada. AR-0002: Venda 2 em aberto. AR-0003: Dona Rita cancelada.
-- -----------------------------------------------------------------------------
INSERT INTO accounts_receivable (id, number, client_id, sale_id, invoice_id, description, amount, amount_received, due_date, received_at, status, notes) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'AR-0001', '22222222-2222-2222-2222-222222222001', '99999999-9999-9999-9999-999999999001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Recebimento da Venda NF-0001',      22000.00, 22000.00, '2026-02-25', '2026-02-25 14:30:00-03', 'quitado',   NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'AR-0002', '22222222-2222-2222-2222-222222222002', '99999999-9999-9999-9999-999999999002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'Recebimento da Venda NF-0002',      23250.00,     0.00, '2026-04-15', NULL,                     'em_aberto', NULL),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'AR-0003', '22222222-2222-2222-2222-222222222003', NULL,                                   NULL,                                   'Conta cancelada - inadimplência',   1500.00,     0.00, '2026-03-10', NULL,                     'cancelada', 'Cliente marcado como inadimplente')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 14. PAYROLL PERIODS (3: 01/2026 fechada+paga, 02/2026 fechada+paga, 03/2026 aberta)
-- -----------------------------------------------------------------------------
INSERT INTO payroll_periods (id, competency_year, competency_month, status, closed_at, total_amount) VALUES
('dddddddd-dddd-dddd-dddd-dddddddd0001', 2026, 1, 'fechada', '2026-02-01 18:00:00-03', 29300.00),
('dddddddd-dddd-dddd-dddd-dddddddd0002', 2026, 2, 'fechada', '2026-03-01 18:00:00-03', 29943.33),
('dddddddd-dddd-dddd-dddd-dddddddd0003', 2026, 3, 'aberta',  NULL,                      29300.00)
ON CONFLICT (id) DO NOTHING;

-- Entries 01/2026 (PAGO) - 8 funcionários
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
('dddddddd-dddd-dddd-dddd-ddd010100001', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444001', 6000.00, 0, 0,    0, 0,    0, 6000.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100002', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444002', 3500.00, 0, 0,    0, 0,    0, 3500.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100003', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444003', 2200.00, 0, 0,    0, 0,    0, 2200.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100004', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444004', 5500.00, 0, 0,    0, 0,    0, 5500.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100005', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444005', 4000.00, 0, 0,    0, 0,    0, 4000.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100006', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444006', 4500.00, 0, 0,    0, 0,    0, 4500.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100007', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444007', 1800.00, 0, 0,    0, 0,    0, 1800.00, 'pago', '2026-02-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd010100008', 'dddddddd-dddd-dddd-dddd-dddddddd0001', '44444444-4444-4444-4444-444444444008', 1800.00, 0, 0,    0, 0,    0, 1800.00, 'pago', '2026-02-05 10:00:00-03')
ON CONFLICT (id) DO NOTHING;

-- Entries 02/2026 (PAGO) - 8 funcionários com algumas variações
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
('dddddddd-dddd-dddd-dddd-ddd020200001', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444001', 6000.00, 10, 500.00, 0, 0,      100, 6400.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200002', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444002', 3500.00,  0,   0,   1, 116.67,  0,  3383.33, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200003', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444003', 2200.00,  8, 160.00, 0, 0,      0,  2360.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200004', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444004', 5500.00,  0,   0,   0, 0,      0,  5500.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200005', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444005', 4000.00,  0,   0,   0, 0,      0,  4000.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200006', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444006', 4500.00,  0,   0,   0, 0,      0,  4500.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200007', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444007', 1800.00,  0,   0,   0, 0,      0,  1800.00, 'pago', '2026-03-05 10:00:00-03'),
('dddddddd-dddd-dddd-dddd-ddd020200008', 'dddddddd-dddd-dddd-dddd-dddddddd0002', '44444444-4444-4444-4444-444444444008', 1800.00,  0,   0,   0, 0,      0,  1800.00, 'pago', '2026-03-05 10:00:00-03')
ON CONFLICT (id) DO NOTHING;

-- Entries 03/2026 (ABERTA, PENDENTE) - 8 funcionários
INSERT INTO payroll_entries (id, payroll_period_id, employee_id, base_salary, extras_hours, extras_value, absences_quantity, absences_value, deductions_value, net_amount, status, paid_at) VALUES
('dddddddd-dddd-dddd-dddd-ddd030300001', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444001', 6000.00, 0, 0, 0, 0, 0, 6000.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300002', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444002', 3500.00, 0, 0, 0, 0, 0, 3500.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300003', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444003', 2200.00, 0, 0, 0, 0, 0, 2200.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300004', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444004', 5500.00, 0, 0, 0, 0, 0, 5500.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300005', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444005', 4000.00, 0, 0, 0, 0, 0, 4000.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300006', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444006', 4500.00, 0, 0, 0, 0, 0, 4500.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300007', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444007', 1800.00, 0, 0, 0, 0, 0, 1800.00, 'pendente', NULL),
('dddddddd-dddd-dddd-dddd-ddd030300008', 'dddddddd-dddd-dddd-dddd-dddddddd0003', '44444444-4444-4444-4444-444444444008', 1800.00, 0, 0, 0, 0, 0, 1800.00, 'pendente', NULL)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 15. STOCK MOVEMENTS (seed das entradas/saídas que justificam quantity_on_hand)
-- Entrada inicial de equipamentos; entrada de compra; saídas da produção e vendas;
-- entradas do café produzido.
-- -----------------------------------------------------------------------------
INSERT INTO stock_movements (id, stock_item_id, movement_type, quantity, unit_cost, total_value, description, source_module, reference_id, occurred_at) VALUES
-- Equipamentos iniciais
('ffffffff-ffff-ffff-ffff-ffffff000001', '55555555-5555-5555-5555-555555555021', 'entrada',   1.000, 185000.00, 185000.00, 'Aquisição inicial do trator',          'seed',     NULL, '2025-06-01 09:00:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000002', '55555555-5555-5555-5555-555555555022', 'entrada',   1.000, 250000.00, 250000.00, 'Aquisição inicial da colheitadeira',   'seed',     NULL, '2025-06-01 09:00:00-03'),
-- Saldo inicial de café tradicional já existente (antes da produção)
('ffffffff-ffff-ffff-ffff-ffffff000003', '55555555-5555-5555-5555-555555555003', 'entrada',  30.000, 450.00,    13500.00, 'Saldo inicial de café tradicional',     'seed',     NULL, '2025-12-01 08:00:00-03'),
-- Consumo de insumos na produção (saídas)
('ffffffff-ffff-ffff-ffff-ffffff000010', '55555555-5555-5555-5555-555555555011', 'saida',   400.000,  12.00,    4800.00, 'Consumo fertilizante na safra talhão A', 'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 08:10:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000011', '55555555-5555-5555-5555-555555555012', 'saida',   150.000,   8.00,    1200.00, 'Consumo adubo na safra talhão A',        'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 08:10:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000012', '55555555-5555-5555-5555-555555555013', 'saida',   100.000,  25.00,    2500.00, 'Consumo pesticida na safra talhão A',    'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 08:10:00-03'),
-- Produção: entrada de café produzido (por qualidade)
('ffffffff-ffff-ffff-ffff-ffffff000020', '55555555-5555-5555-5555-555555555001', 'entrada',  19.000, 900.00,    17100.00, 'Safra talhão A - café especial',         'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 12:00:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000021', '55555555-5555-5555-5555-555555555002', 'entrada',  52.000, 650.00,    33800.00, 'Safra talhão A - café superior',         'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 12:00:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000022', '55555555-5555-5555-5555-555555555003', 'entrada',  29.000, 450.00,    13050.00, 'Safra talhão A - café tradicional',      'pcp',      '77777777-7777-7777-7777-777777777001', '2026-01-15 12:00:00-03'),
-- Compra concluída: entradas de insumos
('ffffffff-ffff-ffff-ffff-ffffff000030', '55555555-5555-5555-5555-555555555011', 'entrada', 500.000,  12.00,    6000.00, 'Entrada compra AP-0001 - fertilizante',  'compras',  '88888888-8888-8888-8888-888888888001', '2026-02-05 14:30:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000031', '55555555-5555-5555-5555-555555555012', 'entrada', 200.000,   8.00,    1600.00, 'Entrada compra AP-0001 - adubo',         'compras',  '88888888-8888-8888-8888-888888888001', '2026-02-05 14:30:00-03'),
-- Vendas: saídas de café
('ffffffff-ffff-ffff-ffff-ffffff000040', '55555555-5555-5555-5555-555555555001', 'saida',    10.000, 900.00,    9000.00, 'Venda NF-0001 - café especial',          'comercial','99999999-9999-9999-9999-999999999001', '2026-02-20 10:05:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000041', '55555555-5555-5555-5555-555555555002', 'saida',    20.000, 650.00,    13000.00, 'Venda NF-0001 - café superior',         'comercial','99999999-9999-9999-9999-999999999001', '2026-02-20 10:05:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000042', '55555555-5555-5555-5555-555555555002', 'saida',    15.000, 650.00,    9750.00, 'Venda NF-0002 - café superior',          'comercial','99999999-9999-9999-9999-999999999002', '2026-03-15 11:35:00-03'),
('ffffffff-ffff-ffff-ffff-ffffff000043', '55555555-5555-5555-5555-555555555003', 'saida',    30.000, 450.00,    13500.00, 'Venda NF-0002 - café tradicional',       'comercial','99999999-9999-9999-9999-999999999002', '2026-03-15 11:35:00-03')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 16. FINANCIAL MOVEMENTS (saldo inicial + eventos dos últimos 3 meses)
-- Saldo inicial R$ 150.000 em 2026-01-01.
-- Entradas: 150000 (saldo inicial) + 22000 (recebimento AR-0001) = 172000
-- Saídas:   59043.33 (folha 01+02) + 7600 (pagamento AP-0001) = 66643.33
--           (registros de produção/compra/venda/ajuste e os 3 movimentos da
--            Cotação 1 na seção 18g são R$0 e não afetam o saldo)
-- Saldo projetado: 172000 - 66643.33 = 105356.67
-- -----------------------------------------------------------------------------
INSERT INTO financial_movements (id, movement_type, category, amount, description, source_module, reference_id, occurred_at) VALUES
-- Saldo inicial
('a0000000-0000-0000-0000-000000000001', 'entrada', 'saldo_inicial', 150000.00, 'Saldo inicial da conta corrente',             'seed',       NULL,                                   '2026-01-01 00:00:00-03'),
-- Produção (registro contábil, R$ 0)
('a0000000-0000-0000-0000-000000000002', 'saida',   'producao',          0.00, 'Produção safra talhão A (registro)',           'pcp',        '77777777-7777-7777-7777-777777777001', '2026-01-15 12:00:00-03'),
-- Folha 01/2026 (pagamentos realizados em 05/02)
('a0000000-0000-0000-0000-000000000010', 'saida',   'folha',          6000.00, 'Pagamento folha 01/2026 - João Silva',         'folha',      'dddddddd-dddd-dddd-dddd-ddd010100001', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000011', 'saida',   'folha',          3500.00, 'Pagamento folha 01/2026 - Maria Santos',       'folha',      'dddddddd-dddd-dddd-dddd-ddd010100002', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000012', 'saida',   'folha',          2200.00, 'Pagamento folha 01/2026 - Carlos Oliveira',    'folha',      'dddddddd-dddd-dddd-dddd-ddd010100003', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000013', 'saida',   'folha',          5500.00, 'Pagamento folha 01/2026 - Ana Pereira',        'folha',      'dddddddd-dddd-dddd-dddd-ddd010100004', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000014', 'saida',   'folha',          4000.00, 'Pagamento folha 01/2026 - Pedro Costa',        'folha',      'dddddddd-dddd-dddd-dddd-ddd010100005', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000015', 'saida',   'folha',          4500.00, 'Pagamento folha 01/2026 - Lucas Rodrigues',    'folha',      'dddddddd-dddd-dddd-dddd-ddd010100006', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000016', 'saida',   'folha',          1800.00, 'Pagamento folha 01/2026 - Rafael Almeida',     'folha',      'dddddddd-dddd-dddd-dddd-ddd010100007', '2026-02-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000017', 'saida',   'folha',          1800.00, 'Pagamento folha 01/2026 - Sofia Lima',         'folha',      'dddddddd-dddd-dddd-dddd-ddd010100008', '2026-02-05 10:00:00-03'),
-- Compra concluída (registro)
('a0000000-0000-0000-0000-000000000020', 'saida',   'compra',            0.00, 'Compra concluída AP-0001 (registro)',          'compras',    '88888888-8888-8888-8888-888888888001', '2026-02-05 14:30:00-03'),
-- Pagamento AP-0001
('a0000000-0000-0000-0000-000000000021', 'saida',   'pagamento',      7600.00, 'Pagamento AP-0001 - AgroInsumos',              'financeiro', 'cccccccc-cccc-cccc-cccc-cccccccc0001', '2026-02-10 11:00:00-03'),
-- Venda 1 (registro) + recebimento
('a0000000-0000-0000-0000-000000000030', 'entrada', 'venda',             0.00, 'Venda NF-0001 (registro)',                     'comercial',  '99999999-9999-9999-9999-999999999001', '2026-02-20 10:00:00-03'),
('a0000000-0000-0000-0000-000000000031', 'entrada', 'recebimento',   22000.00, 'Recebimento AR-0001 - Cafeteria Grão Fino',    'financeiro', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '2026-02-25 14:30:00-03'),
-- Folha 02/2026
('a0000000-0000-0000-0000-000000000040', 'saida',   'folha',          6400.00, 'Pagamento folha 02/2026 - João Silva',         'folha',      'dddddddd-dddd-dddd-dddd-ddd020200001', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000041', 'saida',   'folha',          3383.33, 'Pagamento folha 02/2026 - Maria Santos',       'folha',      'dddddddd-dddd-dddd-dddd-ddd020200002', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000042', 'saida',   'folha',          2360.00, 'Pagamento folha 02/2026 - Carlos Oliveira',    'folha',      'dddddddd-dddd-dddd-dddd-ddd020200003', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000043', 'saida',   'folha',          5500.00, 'Pagamento folha 02/2026 - Ana Pereira',        'folha',      'dddddddd-dddd-dddd-dddd-ddd020200004', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000044', 'saida',   'folha',          4000.00, 'Pagamento folha 02/2026 - Pedro Costa',        'folha',      'dddddddd-dddd-dddd-dddd-ddd020200005', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000045', 'saida',   'folha',          4500.00, 'Pagamento folha 02/2026 - Lucas Rodrigues',    'folha',      'dddddddd-dddd-dddd-dddd-ddd020200006', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000046', 'saida',   'folha',          1800.00, 'Pagamento folha 02/2026 - Rafael Almeida',     'folha',      'dddddddd-dddd-dddd-dddd-ddd020200007', '2026-03-05 10:00:00-03'),
('a0000000-0000-0000-0000-000000000047', 'saida',   'folha',          1800.00, 'Pagamento folha 02/2026 - Sofia Lima',         'folha',      'dddddddd-dddd-dddd-dddd-ddd020200008', '2026-03-05 10:00:00-03'),
-- Ajuste pequeno de estoque (R$ 0)
('a0000000-0000-0000-0000-000000000050', 'saida',   'ajuste',            0.00, 'Ajuste manual de estoque - contagem',          'estoque',    NULL,                                   '2026-03-10 09:00:00-03'),
-- Venda 2 (registro, ainda não recebida)
('a0000000-0000-0000-0000-000000000060', 'entrada', 'venda',             0.00, 'Venda NF-0002 (registro, AR em aberto)',       'comercial',  '99999999-9999-9999-9999-999999999002', '2026-03-15 11:30:00-03')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 17. NOTIFICATIONS (exemplos)
-- -----------------------------------------------------------------------------
INSERT INTO notifications (id, type, title, message, module, link, is_read, user_id) VALUES
('ab000000-0000-0000-0000-000000000001', 'warning', 'Estoque abaixo do mínimo', 'Pesticida Fungicida (INS-PEST) está com 15 litros (mín. 20)', 'estoque',  '/estoque',   FALSE, '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000002', 'warning', 'Conta a receber em aberto', 'NF-0002 vence em 2026-04-15 (R$ 23.250,00)',              'financeiro', '/financeiro', FALSE, '11111111-1111-1111-1111-111111111001'),
('ab000000-0000-0000-0000-000000000003', 'info',    'Folha 03/2026 aberta',     'Lançamentos da competência 03/2026 estão abertos',          'folha',    '/folha',     TRUE,  '11111111-1111-1111-1111-111111111001')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 18. COTAÇÕES (sub-fluxo de Compras) — 3 cenários
-- Cot 1 (produto, concluída) gerou a PO 88...8802; Cot 2 (produto) aguarda o
-- financeiro; Cot 3 (serviço) ainda coletando propostas.
-- FK circular: quotations.winning_proposal_id -> quotation_proposals e
-- quotation_proposals.quotation_id -> quotations. Por isso inserimos as cotações
-- com winning_proposal_id NULL e definimos o vencedor via UPDATE no final.
-- -----------------------------------------------------------------------------

-- 18a. PurchaseOrder gerada pela Cotação 1 (status "aprovada" = aguardando
-- conferência; ainda não recebida, logo sem stock_movement / accounts_payable).
INSERT INTO purchase_orders (id, supplier_id, status, total_amount, ordered_at, received_at, notes, order_type) VALUES
('88888888-8888-8888-8888-888888888002', '33333333-3333-3333-3333-333333333001', 'aprovada', 3020.00, '2026-04-10 09:00:00-03', NULL, 'Gerada a partir da cotação b0000000-0000-0000-0000-b00000000001', 'produto')
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_order_items (id, purchase_order_id, stock_item_id, description, quantity, unit_price, subtotal) VALUES
('88888888-8888-8888-8888-888888888021', '88888888-8888-8888-8888-888888888002', '55555555-5555-5555-5555-555555555011', 'Fertilizante NPK 200kg', 200.000, 11.50, 2300.00),
('88888888-8888-8888-8888-888888888022', '88888888-8888-8888-8888-888888888002', '55555555-5555-5555-5555-555555555013', 'Pesticida Fungicida 30L',  30.000, 24.00,  720.00)
ON CONFLICT (id) DO NOTHING;

-- 18b. Cotações (winning_proposal_id definido por UPDATE em 18f).
INSERT INTO quotations (id, order_type, status, service_description, notes, cancellation_note, winning_proposal_id, purchase_order_id, deleted_at) VALUES
('b0000000-0000-0000-0000-b00000000001', 'produto', 'concluida',                       NULL,                                                                          'Reposição de NPK e fungicida via cotação', NULL, NULL, '88888888-8888-8888-8888-888888888002', NULL),
('b0000000-0000-0000-0000-b00000000002', 'produto', 'aguardando_aprovacao_financeiro', NULL,                                                                          'Cotação de adubo aguardando o financeiro',  NULL, NULL, NULL,                                   NULL),
('b0000000-0000-0000-0000-b00000000003', 'servico', 'em_andamento',                    'Manutenção preventiva do trator New Holland T6 — revisão de 500h',           'Coletando propostas de manutenção',          NULL, NULL, NULL,                                   NULL)
ON CONFLICT (id) DO NOTHING;

-- 18c. Itens das cotações de produto (serviço não tem itens de estoque).
INSERT INTO quotation_items (id, quotation_id, stock_item_id, quantity) VALUES
-- Cotação 1: 200kg NPK + 30L Pesticida
('b1000000-0000-0000-0000-b10000000011', 'b0000000-0000-0000-0000-b00000000001', '55555555-5555-5555-5555-555555555011', 200.000),
('b1000000-0000-0000-0000-b10000000012', 'b0000000-0000-0000-0000-b00000000001', '55555555-5555-5555-5555-555555555013',  30.000),
-- Cotação 2: 100kg Adubo Orgânico
('b1000000-0000-0000-0000-b10000000021', 'b0000000-0000-0000-0000-b00000000002', '55555555-5555-5555-5555-555555555012', 100.000)
ON CONFLICT (id) DO NOTHING;

-- 18d. Propostas. total_price só é usado em cotações de serviço; nas de produto
-- o valor é derivado dos quotation_proposal_items (total_price = NULL).
INSERT INTO quotation_proposals (id, quotation_id, supplier_id, total_price, notes) VALUES
-- Cotação 1: AgroInsumos (vencedora, R$3.020,00) x Fazenda São Pedro (R$3.180,00)
('b2000000-0000-0000-0000-b20000000011', 'b0000000-0000-0000-0000-b00000000001', '33333333-3333-3333-3333-333333333001', NULL, 'Melhor preço — vencedora'),
('b2000000-0000-0000-0000-b20000000012', 'b0000000-0000-0000-0000-b00000000001', '33333333-3333-3333-3333-333333333002', NULL, 'Proposta concorrente'),
-- Cotação 2: AgroInsumos (vencedora, R$7,80/kg) x Máquinas Serra Verde (R$8,50/kg)
('b2000000-0000-0000-0000-b20000000021', 'b0000000-0000-0000-0000-b00000000002', '33333333-3333-3333-3333-333333333001', NULL, 'Melhor preço — vencedora'),
('b2000000-0000-0000-0000-b20000000022', 'b0000000-0000-0000-0000-b00000000002', '33333333-3333-3333-3333-333333333003', NULL, 'Proposta concorrente'),
-- Cotação 3 (serviço): Máquinas Serra Verde, preço fechado de R$2.800,00
('b2000000-0000-0000-0000-b20000000031', 'b0000000-0000-0000-0000-b00000000003', '33333333-3333-3333-3333-333333333003', 2800.00, 'Revisão de 500h, peças inclusas')
ON CONFLICT (id) DO NOTHING;

-- 18e. Preços unitários por item dentro de cada proposta de produto.
INSERT INTO quotation_proposal_items (id, proposal_id, quotation_item_id, unit_price) VALUES
-- Cotação 1 / AgroInsumos: NPK R$11,50 + Pesticida R$24,00 = R$3.020,00
('b3000000-0000-0000-0000-b30000000111', 'b2000000-0000-0000-0000-b20000000011', 'b1000000-0000-0000-0000-b10000000011', 11.50),
('b3000000-0000-0000-0000-b30000000112', 'b2000000-0000-0000-0000-b20000000011', 'b1000000-0000-0000-0000-b10000000012', 24.00),
-- Cotação 1 / Fazenda São Pedro: NPK R$12,00 + Pesticida R$26,00 = R$3.180,00
('b3000000-0000-0000-0000-b30000000121', 'b2000000-0000-0000-0000-b20000000012', 'b1000000-0000-0000-0000-b10000000011', 12.00),
('b3000000-0000-0000-0000-b30000000122', 'b2000000-0000-0000-0000-b20000000012', 'b1000000-0000-0000-0000-b10000000012', 26.00),
-- Cotação 2 / AgroInsumos: Adubo R$7,80
('b3000000-0000-0000-0000-b30000000211', 'b2000000-0000-0000-0000-b20000000021', 'b1000000-0000-0000-0000-b10000000021',  7.80),
-- Cotação 2 / Máquinas Serra Verde: Adubo R$8,50
('b3000000-0000-0000-0000-b30000000221', 'b2000000-0000-0000-0000-b20000000022', 'b1000000-0000-0000-0000-b10000000021',  8.50)
ON CONFLICT (id) DO NOTHING;

-- 18f. Define a proposta vencedora (após as propostas existirem — FK circular).
UPDATE quotations SET winning_proposal_id = 'b2000000-0000-0000-0000-b20000000011'
WHERE id = 'b0000000-0000-0000-0000-b00000000001';
UPDATE quotations SET winning_proposal_id = 'b2000000-0000-0000-0000-b20000000021'
WHERE id = 'b0000000-0000-0000-0000-b00000000002';

-- 18g. Movimentos financeiros de registro da Cotação 1 (R$0 — não afetam saldo;
-- apenas histórico: criação, seleção de vencedor e aprovação do financeiro).
INSERT INTO financial_movements (id, movement_type, category, amount, description, source_module, reference_id, occurred_at) VALUES
('a0000000-0000-0000-0000-000000000070', 'saida', 'compra', 0.00, 'Cotação criada (registro) - reposição NPK e fungicida', 'compras', 'b0000000-0000-0000-0000-b00000000001', '2026-04-05 09:00:00-03'),
('a0000000-0000-0000-0000-000000000071', 'saida', 'compra', 0.00, 'Cotação - proposta vencedora selecionada (AgroInsumos)', 'compras', 'b0000000-0000-0000-0000-b00000000001', '2026-04-08 10:00:00-03'),
('a0000000-0000-0000-0000-000000000072', 'saida', 'compra', 0.00, 'Cotação aprovada pelo financeiro - pedido gerado',      'compras', 'b0000000-0000-0000-0000-b00000000001', '2026-04-09 11:00:00-03')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Resumo do seed:
--   1 usuário admin
--   3 clientes (1 inadimplente)
--   3 fornecedores
--   8 funcionários (3 CLT, 3 PJ, 2 Temp)
--   9 itens de estoque (3 cafés, 4 insumos, 1 trator, 1 colheitadeira)
--   2 talhões, 3 atividades
--   1 ordem de produção concluída (100 sacas), 2 trabalhadores, 1 serviço externo
--   2 ordens de compra (1 concluída, 1 aprovada gerada pela Cotação 1)
--   2 vendas (1 entregue, 1 realizada)
--   2 faturas
--   2 contas a pagar (1 paga, 1 em aberto)
--   3 contas a receber (1 quitada, 1 em aberto, 1 cancelada)
--   3 períodos de folha, 24 lançamentos
--   7 eventos de folha
--   17 movimentações de estoque
--   27 movimentações financeiras (24 originais + 3 registros R$0 da Cotação 1)
--   3 notificações
--   3 cotações (1 produto concluída, 1 produto aguardando financeiro, 1 serviço em andamento)
--     3 itens de cotação, 5 propostas, 6 itens de proposta
-- Saldo atual previsto: R$ 105.356,67
-- =============================================================================
