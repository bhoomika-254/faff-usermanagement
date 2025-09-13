import React from 'react';
import { Navbar, Nav } from 'react-bootstrap';
import { FaBrain, FaDatabase } from 'react-icons/fa';

const Navigation = () => {
  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="px-3">
      <Navbar.Brand href="/">
        <FaBrain className="me-2" />
        Memory System - Ops Interface
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="basic-navbar-nav" />
      <Navbar.Collapse id="basic-navbar-nav">
        <Nav className="ms-auto">
          <Nav.Link href="/api/health" target="_blank">
            <FaDatabase className="me-1" />
            API Status
          </Nav.Link>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default Navigation;