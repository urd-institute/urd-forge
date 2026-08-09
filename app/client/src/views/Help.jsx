import React from 'react';
import helpText from '../help.md?raw';
import { Markdown, ViewHeader } from '../components/bits.jsx';

export default function Help() {
  return (
    <div className="view">
      <ViewHeader kicker="help" title="How to use URD Forge" />
      <section className="card">
        <Markdown text={helpText} />
      </section>
    </div>
  );
}
