import React from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { FaHome, FaClock, FaUsers, FaChartBar } from 'react-icons/fa';

const Sidebar = () => {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div className="sidebar">
      <Nav className="flex-column p-3">
        <Nav.Link 
          as={Link} 
          to="/" 
          className={isActive('/') ? 'active' : ''}
        >
          <FaHome className="me-2" />
          Dashboard
        </Nav.Link>
        
        <Nav.Link 
          as={Link} 
          to="/pending" 
          className={isActive('/pending') ? 'active' : ''}
        >
          <FaClock className="me-2" />
          Pending Updates
        </Nav.Link>
        
        <Nav.Link 
          as={Link} 
          to="/users" 
          className={isActive('/users') ? 'active' : ''}
        >
          <FaUsers className="me-2" />
          Users Overview
        </Nav.Link>
      </Nav>
    </div>
  );
};

export default Sidebar;