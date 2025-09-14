import React from 'react';
import { Navbar, Nav } from 'react-bootstrap';
import { FaBrain, FaDatabase } from 'react-icons/fa';

const Navigation = () => {
  return (
    <Navbar 
      className="px-4" 
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.95) 100%)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(199, 125, 255, 0.2)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
      }}
      variant="light" 
      expand="lg"
    >
      <Navbar.Brand href="/" className="d-flex align-items-center">
        <FaBrain className="me-2" style={{ color: '#6b73ff' }} />
        <span style={{ 
          background: 'linear-gradient(135deg, #6b73ff 0%, #9c88ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: '700',
          fontSize: '1.4rem'
        }}>
          Memory System
        </span>
        <span style={{ color: '#8b5cf6', marginLeft: '0.5rem', fontWeight: '500' }}>
          - Ops Interface
        </span>
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="basic-navbar-nav" />
      <Navbar.Collapse id="basic-navbar-nav">
        <Nav className="ms-auto">
          <Nav.Link 
            href="/api/health" 
            target="_blank"
            style={{ 
              color: '#7c3aed',
              fontWeight: '500',
              borderRadius: '2rem',
              padding: '0.5rem 1rem',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(124, 58, 237, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
            }}
          >
            <FaDatabase className="me-1" />
            API Status
          </Nav.Link>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default Navigation;