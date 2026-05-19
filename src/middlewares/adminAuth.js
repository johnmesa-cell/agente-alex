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

    if (!token) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/admin/login');
      }
      return res.status(401).json({ message: 'No autorizado' });
    }

    // Delegar validación completa al backend principal
    const response = await fetch(`${process.env.BACKEND_URL}/api/admin/dashboard`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `alex_token=${token}`
      }
    });

    if (!response.ok) {
      if (req.headers.accept?.includes('text/html')) {
        return res.redirect('/admin/login');
      }
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
