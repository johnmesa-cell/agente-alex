export const requireAdmin = async (req, res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    if (!token && req.cookies?.alex_token) {
      token = req.cookies.alex_token;
    }
    if (!token && req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'No autorizado. Inicia sesión en la plataforma principal.' });
    }

    const response = await fetch(`${process.env.BACKEND_URL}/api/admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `alex_token=${token}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        message: response.status === 403 
          ? 'Se requiere rol de administrador' 
          : 'Sesión inválida o expirada'
      });
    }

    req.token = token;
    next();
  } catch (error) {
    console.error('Error validando token con backend:', error.message);
    return res.status(503).json({ message: 'Servicio de autenticación no disponible' });
  }
};
