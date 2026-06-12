"use client"

import { RootLayout } from "@/components/layout/RootLayout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CategoriasTab } from "@/components/modules/configuracoes/CategoriasTab"
import { PapeisTab } from "@/components/modules/configuracoes/PapeisTab"
import { DestinosTab } from "@/components/modules/configuracoes/DestinosTab"
import { EncargosTab } from "@/components/modules/configuracoes/EncargosTab"

export default function ConfiguracoesPage() {
  return (
    <RootLayout title="Configurações">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Configurações</h2>
          <p className="text-slate-500 text-sm">
            Categorias de estoque, papéis de sistema, destinos da colheita e encargos por atraso
          </p>
        </div>

        <Tabs defaultValue="categorias">
          <TabsList>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="papeis">Papéis de Sistema</TabsTrigger>
            <TabsTrigger value="destinos">Destinos da Colheita</TabsTrigger>
            <TabsTrigger value="encargos">Encargos por Atraso</TabsTrigger>
          </TabsList>

          <TabsContent value="categorias" className="space-y-4">
            <CategoriasTab />
          </TabsContent>

          <TabsContent value="papeis" className="space-y-4">
            <PapeisTab />
          </TabsContent>

          <TabsContent value="destinos" className="space-y-4">
            <DestinosTab />
          </TabsContent>

          <TabsContent value="encargos" className="space-y-4">
            <EncargosTab />
          </TabsContent>
        </Tabs>
      </div>
    </RootLayout>
  )
}
