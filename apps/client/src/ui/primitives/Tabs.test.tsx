import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs'

describe('Tabs primitives', () => {
  it('renders tabs structure with expected class names', () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="details">Details content</TabsContent>
      </Tabs>,
    )

    const list = screen.getByRole('tablist', { name: 'Sections' })
    expect(list).toBeInTheDocument()
    expect(list).toHaveClass('ui-tabs-list')
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Overview content')
  })
})