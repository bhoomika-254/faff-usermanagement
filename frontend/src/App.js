import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import Navigation from './components/Navigation';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import PendingUpdates from './components/PendingUpdates';
import UserMemory from './components/UserMemory';
import UsersOverview from './components/UsersOverview';
import InformationGraph from './components/InformationGraph';

function App() {
  return (
    <Router>
      <div className="App">
        <Navigation />
        <Container fluid className="p-0">
          <Row className="g-0">
            <Col md={2}>
              <Sidebar />
            </Col>
            <Col md={10} className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pending" element={<PendingUpdates />} />
                <Route path="/users" element={<UsersOverview />} />
                <Route path="/users/:userId" element={<UserMemory />} />
                <Route path="/information-graph" element={<InformationGraph />} />
              </Routes>
            </Col>
          </Row>
        </Container>
      </div>
    </Router>
  );
}

export default App;