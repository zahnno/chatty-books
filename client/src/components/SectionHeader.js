import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'react-feather';

// Shared heading for home and listing sections: optional eyebrow, title, subtitle and a
// trailing "see all" style link.
export default function SectionHeader({ eyebrow, title, subtitle, actionLabel, actionTo, as: Heading = 'h2' }) {
  return (
    <div className="ui-section-header">
      <div className="ui-section-header-text">
        {eyebrow && <span className="ui-section-eyebrow">{eyebrow}</span>}
        <Heading className="ui-section-title">{title}</Heading>
        {subtitle && <p className="ui-section-subtitle">{subtitle}</p>}
      </div>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="ui-section-action">
          {actionLabel}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
